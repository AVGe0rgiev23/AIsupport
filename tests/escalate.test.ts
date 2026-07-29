import { MongoClient, ObjectId, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withOrg } from "@/lib/db/withOrg";
import { createEscalationTicket } from "@/lib/chat/escalate";

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
const orgA = new ObjectId();
const orgB = new ObjectId();
let conversationId: ObjectId;

// Each test that escalates needs its OWN conversation: createEscalationTicket
// now dedupes per conversation, so sharing one across tests would make the
// second escalation return the first test's ticket.
async function newConversation(orgId: ObjectId): Promise<ObjectId> {
  const now = new Date();
  const res = await withOrg(db, orgId).insertOne("conversations", {
    channel: "widget",
    visitor: { email: null, name: null, pageUrl: null },
    status: "open",
    resolution: null,
    createdAt: now,
    updatedAt: now,
  });
  return res.insertedId as ObjectId;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  db = client.db("supportai-test");
  conversationId = await newConversation(orgA);
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("createEscalationTicket", () => {
  it("creates a ticket and marks the conversation escalated", async () => {
    const ticketId = await createEscalationTicket(db, {
      orgId: orgA,
      conversationId,
      visitorEmail: "visitor@example.com",
      note: "Please help with my refund",
      reason: "model_requested",
    });
    expect(ticketId).not.toBeNull();

    const ticket = await db.collection("tickets").findOne({ _id: ticketId! });
    expect(ticket?.visitorEmail).toBe("visitor@example.com");
    expect(ticket?.question).toBe("Please help with my refund");
    expect(ticket?.status).toBe("open");

    const conversation = await db.collection("conversations").findOne({ _id: conversationId });
    expect(conversation?.status).toBe("escalated");
  });

  // Previously this reused the conversation escalated by the test above and
  // asserted a SECOND ticket was created — i.e. it pinned the unbounded
  // duplicate-ticket behaviour that the dedup test below now forbids. Rewritten
  // against a fresh conversation so it still covers what it was actually for
  // (the note -> question fallback) without encoding the bug.
  it("falls back to the reason as the question when note is empty", async () => {
    const ticketId = await createEscalationTicket(db, {
      orgId: orgA,
      conversationId: await newConversation(orgA),
      visitorEmail: "v2@example.com",
      note: "",
      reason: "quota",
    });
    const ticket = await db.collection("tickets").findOne({ _id: ticketId! });
    expect(ticket?.question).toBe("quota");
  });

  // /api/chat/escalate is unauthenticated: without this, N POSTs replaying the
  // same conversationId create N tickets and N ticket documents.
  it("returns the existing ticket instead of inserting when already escalated", async () => {
    const convo = await newConversation(orgA);
    const first = await createEscalationTicket(db, {
      orgId: orgA,
      conversationId: convo,
      visitorEmail: "dupe@example.com",
      note: "first note",
      reason: "user_requested",
    });
    expect(first).not.toBeNull();

    const before = await db.collection("tickets").countDocuments();
    const second = await createEscalationTicket(db, {
      orgId: orgA,
      conversationId: convo,
      visitorEmail: "someone-else@example.com",
      note: "replayed note",
      reason: "user_requested",
    });

    expect(second?.toString()).toBe(first!.toString());
    expect(await db.collection("tickets").countDocuments()).toBe(before);
    // The original ticket is not overwritten by the replay.
    const ticket = await db.collection("tickets").findOne({ _id: first! });
    expect(ticket?.visitorEmail).toBe("dupe@example.com");
    expect(ticket?.question).toBe("first note");
  });

  // The realistic abuse shape is N sequential POSTs replaying one conversationId.
  // (Truly simultaneous replays can still slip past this read-then-insert check;
  // that residual window is covered by the per-caller rate limiter on the route,
  // not by an extra unique index on M0's constrained index budget.)
  it("collapses N sequential replays of the same conversation to one ticket", async () => {
    const convo = await newConversation(orgA);
    const before = await db.collection("tickets").countDocuments();
    const ids: (ObjectId | null)[] = [];
    for (let i = 0; i < 5; i += 1) {
      ids.push(
        await createEscalationTicket(db, {
          orgId: orgA,
          conversationId: convo,
          visitorEmail: "flood@example.com",
          note: "",
          reason: "user_requested",
        }),
      );
    }
    expect(new Set(ids.map((id) => id!.toString())).size).toBe(1);
    expect(await db.collection("tickets").countDocuments()).toBe(before + 1);
    expect(await db.collection("tickets").countDocuments({ conversationId: convo })).toBe(1);
  });

  // A conversation-less escalation has nothing to dedupe against; each is a
  // distinct lead and must still be captured.
  it("does not dedupe conversation-less tickets", async () => {
    const before = await db.collection("tickets").countDocuments();
    const a = await createEscalationTicket(db, {
      orgId: orgA,
      conversationId: null,
      visitorEmail: "lead-a@example.com",
      note: "",
      reason: "error",
    });
    const b = await createEscalationTicket(db, {
      orgId: orgA,
      conversationId: null,
      visitorEmail: "lead-b@example.com",
      note: "",
      reason: "error",
    });
    expect(a!.toString()).not.toBe(b!.toString());
    expect(await db.collection("tickets").countDocuments()).toBe(before + 2);
  });

  it("creates a conversation-less ticket when conversationId is null", async () => {
    const ticketId = await createEscalationTicket(db, {
      orgId: orgA,
      conversationId: null,
      visitorEmail: "early@example.com",
      note: "widget broke before it started",
      reason: "error",
    });
    expect(ticketId).not.toBeNull();
    const ticket = await db.collection("tickets").findOne({ _id: ticketId! });
    expect(ticket?.conversationId).toBeNull();
    expect(ticket?.visitorEmail).toBe("early@example.com");
  });

  it("returns null and creates nothing for a conversation belonging to a different org", async () => {
    const before = await db.collection("tickets").countDocuments();
    const ticketId = await createEscalationTicket(db, {
      orgId: orgB,
      conversationId,
      visitorEmail: "attacker@example.com",
      note: "",
      reason: "user_requested",
    });
    expect(ticketId).toBeNull();
    expect(await db.collection("tickets").countDocuments()).toBe(before);
  });
});
