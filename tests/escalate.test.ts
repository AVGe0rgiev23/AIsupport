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

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  db = client.db("supportai-test");
  const now = new Date();
  const res = await withOrg(db, orgA).insertOne("conversations", {
    channel: "widget",
    visitor: { email: null, name: null, pageUrl: null },
    status: "open",
    resolution: null,
    createdAt: now,
    updatedAt: now,
  });
  conversationId = res.insertedId as ObjectId;
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

  it("falls back to the reason as the question when note is empty", async () => {
    const ticketId = await createEscalationTicket(db, {
      orgId: orgA,
      conversationId,
      visitorEmail: "v2@example.com",
      note: "",
      reason: "quota",
    });
    const ticket = await db.collection("tickets").findOne({ _id: ticketId! });
    expect(ticket?.question).toBe("quota");
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
