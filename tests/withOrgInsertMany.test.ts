import { MongoClient, ObjectId, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withOrg } from "@/lib/db/withOrg";

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
const orgA = new ObjectId();
const orgB = new ObjectId();
const docId = new ObjectId();

function chunk(position: number) {
  return {
    documentId: docId,
    text: `chunk ${position}`,
    embedding: [0.1, 0.2],
    heading: null,
    position,
  };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  db = client.db("supportai-test");
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("withOrg.insertMany", () => {
  it("stamps orgId on every inserted doc", async () => {
    const res = await withOrg(db, orgA).insertMany("chunks", [chunk(0), chunk(1), chunk(2)]);
    expect(res.insertedCount).toBe(3);
    const rows = await db.collection("chunks").find({}).toArray();
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.orgId.equals(orgA)).toBe(true);
  });

  it("inserted docs are invisible to another org", async () => {
    expect(await withOrg(db, orgB).countDocuments("chunks")).toBe(0);
    expect(await withOrg(db, orgA).countDocuments("chunks")).toBe(3);
  });
});
