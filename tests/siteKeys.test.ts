import { MongoClient, ObjectId, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createSiteKey,
  generateSiteKey,
  hashSiteKey,
  isOriginAllowed,
  normalizeDomains,
  verifySiteKey,
} from "@/lib/siteKeys";

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
const orgId = new ObjectId();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  db = client.db("supportai-test");
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("generateSiteKey / hashSiteKey", () => {
  it("generates unique pk_-prefixed keys", () => {
    const a = generateSiteKey();
    const b = generateSiteKey();
    expect(a).toMatch(/^pk_[A-Za-z0-9_-]{20,}$/);
    expect(a).not.toBe(b);
  });

  it("hashes deterministically", () => {
    expect(hashSiteKey("pk_abc")).toBe(hashSiteKey("pk_abc"));
    expect(hashSiteKey("pk_abc")).toHaveLength(64);
  });
});

describe("isOriginAllowed", () => {
  it("allows exact domain and subdomains", () => {
    expect(isOriginAllowed("https://acme.com", ["acme.com"])).toBe(true);
    expect(isOriginAllowed("https://help.acme.com", ["acme.com"])).toBe(true);
  });

  it("rejects other domains and suffix tricks", () => {
    expect(isOriginAllowed("https://evil.com", ["acme.com"])).toBe(false);
    expect(isOriginAllowed("https://notacme.com", ["acme.com"])).toBe(false);
  });

  it("rejects malformed origins", () => {
    expect(isOriginAllowed("not-a-url", ["acme.com"])).toBe(false);
  });
});

describe("normalizeDomains", () => {
  it("lowercases, trims, dedupes, and drops empties", () => {
    expect(normalizeDomains("Acme.com, help.ACME.com , acme.com ,,")).toEqual([
      "acme.com",
      "help.acme.com",
    ]);
  });

  it("returns an empty array for blank input", () => {
    expect(normalizeDomains("   ")).toEqual([]);
  });
});

describe("createSiteKey / verifySiteKey", () => {
  it("round-trips: created key verifies from an allowed origin", async () => {
    const key = await createSiteKey(db, orgId, "Default", ["localhost", "acme.com"]);
    const rec = await verifySiteKey(db, key, "http://localhost:3000");
    expect(rec?.orgId.equals(orgId)).toBe(true);
    expect(rec?.label).toBe("Default");
  });

  it("stores only the hash, never the plain key", async () => {
    const key = await createSiteKey(db, orgId, "HashCheck", ["acme.com"]);
    const raw = await db.collection("apiKeys").findOne({ label: "HashCheck" });
    expect(raw?.hashedKey).toBe(hashSiteKey(key));
    expect(JSON.stringify(raw)).not.toContain(key);
  });

  it("rejects a disallowed origin, a null origin, and an unknown key", async () => {
    const key = await createSiteKey(db, orgId, "Strict", ["acme.com"]);
    expect(await verifySiteKey(db, key, "https://evil.com")).toBeNull();
    expect(await verifySiteKey(db, key, null)).toBeNull();
    expect(await verifySiteKey(db, "pk_unknown", "https://acme.com")).toBeNull();
  });
});
