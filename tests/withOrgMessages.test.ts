import { MongoClient, ObjectId, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withOrg } from "@/lib/db/withOrg";

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
const orgA = new ObjectId();
const orgB = new ObjectId();
const conversationId = new ObjectId();

function message(content: string) {
  return {
    conversationId,
    role: "user" as const,
    content,
    citations: [],
    usage: null,
    createdAt: new Date(),
  };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  db = client.db("supportai-test");
  await withOrg(db, orgA).insertOne("messages", message("A's message"));
  await withOrg(db, orgB).insertOne("messages", message("B's message"));
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("withOrg on messages", () => {
  it("stamps orgId on insert", async () => {
    const raw = await db.collection("messages").findOne({ content: "A's message" });
    expect(raw?.orgId?.equals(orgA)).toBe(true);
  });

  it("find is org-scoped", async () => {
    const rows = await withOrg(db, orgA).find("messages").toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("A's message");
  });

  it("findOne cannot fetch another org's message even by _id", async () => {
    const bMsg = await db.collection("messages").findOne({ content: "B's message" });
    const stolen = await withOrg(db, orgA).findOne("messages", { _id: bMsg!._id });
    expect(stolen).toBeNull();
  });
});
