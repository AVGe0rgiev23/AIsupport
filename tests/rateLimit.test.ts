import { MongoClient, ObjectId, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureIndexes } from "@/lib/db/indexes";
import {
  RATE_LIMIT_BUCKETS,
  RATE_LIMIT_WINDOW_MS,
  consumeRateLimit,
  rateLimitBucket,
} from "@/lib/chat/rateLimit";

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  db = client.db("supportai-test");
  // The unique {orgId, bucket, window} index must exist for the concurrency
  // test below to genuinely exercise the E11000 race consumeRateLimit guards.
  await ensureIndexes(db);
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("rateLimitBucket", () => {
  it("prefers x-real-ip (the header the platform sets and rewrites)", () => {
    const a = rateLimitBucket(headers({ "x-real-ip": "1.2.3.4" }), "token-a");
    const b = rateLimitBucket(headers({ "x-real-ip": "1.2.3.4" }), "token-b");
    expect(a).toBe(b); // same caller IP, different tokens -> same bucket
  });

  it("falls back to the leftmost x-forwarded-for entry", () => {
    const viaXff = rateLimitBucket(headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }), "t");
    const viaReal = rateLimitBucket(headers({ "x-real-ip": "1.2.3.4" }), "t");
    expect(viaXff).toBe(viaReal);
  });

  it("falls back to the widget token when no IP header is present", () => {
    const a = rateLimitBucket(headers({}), "token-a");
    const b = rateLimitBucket(headers({}), "token-a");
    const c = rateLimitBucket(headers({}), "token-b");
    expect(a).toBe(b);
    expect(a).not.toBe(c); // overwhelmingly likely; fixed inputs, deterministic
  });

  it("maps every caller into a fixed, bounded bucket space", () => {
    // This is what stops the limiter from becoming its own write amplifier:
    // an actor rotating spoofed IPs can never create more than
    // RATE_LIMIT_BUCKETS counter documents per org per window.
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i += 1) {
      const bucket = rateLimitBucket(headers({ "x-real-ip": `10.0.${i >> 8}.${i & 255}` }), "t");
      expect(bucket).toMatch(/^[0-9a-f]{2}$/);
      seen.add(bucket);
    }
    expect(seen.size).toBeLessThanOrEqual(RATE_LIMIT_BUCKETS);
    expect(seen.size).toBeGreaterThan(200); // spreads, not degenerate
  });
});

describe("consumeRateLimit", () => {
  it("allows exactly `limit` calls in a window, then rejects", async () => {
    const orgId = new ObjectId();
    const now = 1_000_000_000_000;
    for (let i = 0; i < 3; i += 1) {
      expect(await consumeRateLimit(db, orgId, "aa", 3, now)).toBe(true);
    }
    expect(await consumeRateLimit(db, orgId, "aa", 3, now)).toBe(false);
    expect(await consumeRateLimit(db, orgId, "aa", 3, now)).toBe(false);
  });

  it("resets in the next window", async () => {
    const orgId = new ObjectId();
    const now = 1_000_000_000_000;
    expect(await consumeRateLimit(db, orgId, "bb", 1, now)).toBe(true);
    expect(await consumeRateLimit(db, orgId, "bb", 1, now)).toBe(false);
    expect(await consumeRateLimit(db, orgId, "bb", 1, now + RATE_LIMIT_WINDOW_MS)).toBe(true);
  });

  it("counts buckets independently", async () => {
    const orgId = new ObjectId();
    const now = 1_000_000_000_000;
    expect(await consumeRateLimit(db, orgId, "cc", 1, now)).toBe(true);
    expect(await consumeRateLimit(db, orgId, "cc", 1, now)).toBe(false);
    expect(await consumeRateLimit(db, orgId, "dd", 1, now)).toBe(true);
  });

  it("is org-scoped: one tenant's flood cannot throttle another", async () => {
    const orgA = new ObjectId();
    const orgB = new ObjectId();
    const now = 1_000_000_000_000;
    expect(await consumeRateLimit(db, orgA, "ee", 1, now)).toBe(true);
    expect(await consumeRateLimit(db, orgA, "ee", 1, now)).toBe(false);
    expect(await consumeRateLimit(db, orgB, "ee", 1, now)).toBe(true);

    const rows = await db.collection("widgetRateLimit").find({ bucket: "ee" }).toArray();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.orgId instanceof ObjectId)).toBe(true);
  });

  it("writes exactly one counter document per org+bucket+window", async () => {
    const orgId = new ObjectId();
    const now = 1_000_000_000_000;
    for (let i = 0; i < 10; i += 1) {
      await consumeRateLimit(db, orgId, "ff", 100, now);
    }
    const rows = await db.collection("widgetRateLimit").find({ orgId }).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(10);
  });

  it("stamps an expiresAt so counters are reaped by the TTL index", async () => {
    const orgId = new ObjectId();
    const now = 1_000_000_000_000;
    await consumeRateLimit(db, orgId, "gg", 5, now);
    const row = await db.collection("widgetRateLimit").findOne({ orgId, bucket: "gg" });
    expect(row?.expiresAt).toBeInstanceOf(Date);
    expect((row!.expiresAt as Date).getTime()).toBeGreaterThan(now);
  });

  it("survives concurrent first-of-window upserts without a duplicate-key rejection", async () => {
    const orgId = new ObjectId();
    const now = 1_000_000_000_000;
    const results = await Promise.all(
      Array.from({ length: 5 }, () => consumeRateLimit(db, orgId, "hh", 100, now)),
    );
    expect(results.every(Boolean)).toBe(true);
    const row = await db.collection("widgetRateLimit").findOne({ orgId, bucket: "hh" });
    expect(row?.count).toBe(5);
  });

  it("fails open when the counter store errors — a Mongo blip must not lock the widget out", async () => {
    const fakeDb = {
      collection: () => ({
        findOneAndUpdate: async () => {
          throw new Error("connection reset by peer");
        },
      }),
    } as unknown as Db;
    expect(await consumeRateLimit(fakeDb, new ObjectId(), "ii", 1, Date.now())).toBe(true);
  });
});
