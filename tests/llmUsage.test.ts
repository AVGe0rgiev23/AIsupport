import { MongoClient, ObjectId, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTodayUsage, incrementUsage } from "@/lib/llmUsage";

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
const orgId = new ObjectId();

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
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

describe("getTodayUsage", () => {
  it("sums requests across both providers for today only", async () => {
    const today = isoDate(new Date());
    const yesterday = isoDate(new Date(Date.now() - 86_400_000));
    await db.collection("llmUsage").insertMany([
      { orgId, date: today, provider: "google", requests: 5, tokens: 100 },
      { orgId, date: today, provider: "groq", requests: 3, tokens: 50 },
      { orgId, date: yesterday, provider: "google", requests: 999, tokens: 9999 },
    ]);
    expect(await getTodayUsage(db, orgId)).toBe(8);
  });

  it("returns 0 for an org with no usage rows today", async () => {
    expect(await getTodayUsage(db, new ObjectId())).toBe(0);
  });
});

describe("incrementUsage", () => {
  it("creates a row on first use and increments on subsequent calls", async () => {
    const org = new ObjectId();
    await incrementUsage(db, org, "google", 42);
    expect(await getTodayUsage(db, org)).toBe(1);
    await incrementUsage(db, org, "google", 8);
    expect(await getTodayUsage(db, org)).toBe(2);
    const row = await db.collection("llmUsage").findOne({ orgId: org, provider: "google" });
    expect(row?.tokens).toBe(50);
  });

  it("tracks providers independently within the same day", async () => {
    const org = new ObjectId();
    await incrementUsage(db, org, "google", 10);
    await incrementUsage(db, org, "groq", 20);
    expect(await getTodayUsage(db, org)).toBe(2);
  });
});
