import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureIndexes } from "@/lib/db/indexes";

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  db = client.db("supportai-test");
  await ensureIndexes(db);
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("ensureIndexes", () => {
  it("creates a unique slug index on organizations", async () => {
    const idx = await db.collection("organizations").indexes();
    expect(idx.find((i) => i.name === "slug_1")?.unique).toBe(true);
  });

  it("creates a unique membership per user+org", async () => {
    const idx = await db.collection("memberships").indexes();
    expect(idx.find((i) => i.name === "userId_1_orgId_1")?.unique).toBe(true);
  });

  it("creates orgId scoping indexes on tenant collections", async () => {
    const chunks = await db.collection("chunks").indexes();
    expect(chunks.some((i) => i.name === "orgId_1_documentId_1")).toBe(true);
    const tickets = await db.collection("tickets").indexes();
    expect(tickets.some((i) => i.name === "orgId_1_status_1_createdAt_-1")).toBe(true);
  });

  it("creates a unique hashedKey index on apiKeys", async () => {
    const idx = await db.collection("apiKeys").indexes();
    expect(idx.find((i) => i.name === "hashedKey_1")?.unique).toBe(true);
  });

  it("creates a unique daily usage counter index", async () => {
    const idx = await db.collection("llmUsage").indexes();
    expect(idx.find((i) => i.name === "orgId_1_date_1_provider_1")?.unique).toBe(true);
  });

  it("is idempotent", async () => {
    await expect(ensureIndexes(db)).resolves.toBeUndefined();
  });
});
