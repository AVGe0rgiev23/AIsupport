import { MongoClient, ObjectId, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureIndexes } from "@/lib/db/indexes";
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
  // The unique {orgId, date, provider} index must exist for the concurrency
  // test below to genuinely exercise the E11000 race incrementUsage guards against.
  await ensureIndexes(db);
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

    const today = isoDate(new Date());
    expect(await db.collection("llmUsage").countDocuments({ orgId: org, date: today })).toBe(2);
    const googleRow = await db.collection("llmUsage").findOne({ orgId: org, provider: "google" });
    const groqRow = await db.collection("llmUsage").findOne({ orgId: org, provider: "groq" });
    expect(googleRow?.requests).toBe(1);
    expect(groqRow?.requests).toBe(1);
  });

  it("handles concurrent first-of-day increments without a duplicate-key rejection", async () => {
    const org = new ObjectId();
    const calls = 5;
    // If incrementUsage doesn't guard the upsert race on the unique
    // {orgId, date, provider} index, one of these rejects with E11000 and
    // this await throws, failing the test.
    await Promise.all(Array.from({ length: calls }, () => incrementUsage(db, org, "google", 1)));
    const row = await db.collection("llmUsage").findOne({ orgId: org, provider: "google" });
    expect(row?.requests).toBe(calls);
  });
});

// A real MongoMemoryServer (standalone, non-sharded) mongod retries a raced
// upsert-vs-unique-index internally, so the "concurrent increments" test above
// cannot deterministically force an E11000 to reach the client. These fakes
// exercise the catch-and-retry branch directly and deterministically, per the
// project's dependency-injected-fake test convention.
describe("incrementUsage duplicate-key retry (deterministic, fake Db)", () => {
  it("retries once and applies the increment when the upsert races into E11000", async () => {
    let calls = 0;
    const updateOne = async (
      _filter: unknown,
      _update: unknown,
      options?: { upsert?: boolean },
    ) => {
      calls += 1;
      if (calls === 1 && options?.upsert) {
        const err = new Error("E11000 duplicate key error collection: llmUsage") as Error & {
          code: number;
        };
        err.code = 11000;
        throw err;
      }
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    };
    const fakeDb = { collection: () => ({ updateOne }) } as unknown as Db;

    await incrementUsage(fakeDb, new ObjectId(), "google", 5);

    expect(calls).toBe(2);
  });

  it("does not swallow non-duplicate-key errors", async () => {
    const updateOne = async () => {
      throw new Error("connection reset by peer");
    };
    const fakeDb = { collection: () => ({ updateOne }) } as unknown as Db;

    await expect(incrementUsage(fakeDb, new ObjectId(), "google", 5)).rejects.toThrow(
      "connection reset by peer",
    );
  });
});
