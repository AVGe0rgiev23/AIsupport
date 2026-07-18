import { MongoClient, ObjectId, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withOrg } from "@/lib/db/withOrg";

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
const orgA = new ObjectId();
const orgB = new ObjectId();

function ticket(question: string) {
  const now = new Date();
  return {
    conversationId: null,
    visitorEmail: "v@example.com",
    question,
    status: "open" as const,
    assignee: null,
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  db = client.db("supportai-test");
  await withOrg(db, orgA).insertOne("tickets", ticket("A's question"));
  await withOrg(db, orgB).insertOne("tickets", ticket("B's question"));
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("withOrg isolation", () => {
  it("stamps orgId on insert", async () => {
    const raw = await db.collection("tickets").findOne({ question: "A's question" });
    expect(raw?.orgId?.equals(orgA)).toBe(true);
  });

  it("find only returns the org's own documents", async () => {
    const rows = await withOrg(db, orgA).find("tickets").toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].question).toBe("A's question");
  });

  it("countDocuments is org-scoped", async () => {
    expect(await withOrg(db, orgA).countDocuments("tickets")).toBe(1);
    expect(await withOrg(db, orgB).countDocuments("tickets")).toBe(1);
  });

  it("findOne cannot fetch another org's document even by _id", async () => {
    const bDoc = await db.collection("tickets").findOne({ question: "B's question" });
    const stolen = await withOrg(db, orgA).findOne("tickets", { _id: bDoc!._id });
    expect(stolen).toBeNull();
  });

  it("updateOne cannot modify another org's document", async () => {
    const bDoc = await db.collection("tickets").findOne({ question: "B's question" });
    const res = await withOrg(db, orgA).updateOne(
      "tickets",
      { _id: bDoc!._id },
      { $set: { status: "closed" } },
    );
    expect(res.matchedCount).toBe(0);
  });

  it("deleteMany cannot delete another org's documents", async () => {
    const res = await withOrg(db, orgA).deleteMany("tickets", { status: "open" });
    expect(res.deletedCount).toBe(1); // only A's
    expect(await db.collection("tickets").countDocuments()).toBe(1); // B's survives
    // restore A's ticket for any later assertions
    await withOrg(db, orgA).insertOne("tickets", ticket("A's question"));
  });
});
