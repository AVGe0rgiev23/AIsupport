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

  // isOriginAllowed compares against URL.hostname, so anything that isn't a
  // bare hostname could never match and would save as a silently-dead config.
  it("strips scheme, port, path, query and fragment down to the hostname", () => {
    expect(normalizeDomains("https://acme.com")).toEqual(["acme.com"]);
    expect(normalizeDomains("http://acme.com/")).toEqual(["acme.com"]);
    expect(normalizeDomains("acme.com:3000")).toEqual(["acme.com"]);
    expect(normalizeDomains("https://acme.com:3000/support?a=1#x")).toEqual(["acme.com"]);
    expect(normalizeDomains("HTTPS://ACME.COM/Help")).toEqual(["acme.com"]);
  });

  it("strips a leading www. or *. so both forms collapse onto the base domain", () => {
    expect(normalizeDomains("www.acme.com")).toEqual(["acme.com"]);
    expect(normalizeDomains("*.acme.com")).toEqual(["acme.com"]);
    // isOriginAllowed already allows subdomains, so these are the same entry.
    expect(normalizeDomains("https://www.acme.com/, acme.com")).toEqual(["acme.com"]);
  });

  // `host.endsWith("." + d)` turns a bare TLD into an allow-all: with "com"
  // stored, https://evil.com passes isOriginAllowed for every tenant.
  it("rejects a bare TLD, which would otherwise allow every domain under it", () => {
    expect(normalizeDomains("com")).toEqual([]);
    expect(normalizeDomains("co.uk, com, acme.com")).toEqual(["co.uk", "acme.com"]);
    expect(isOriginAllowed("https://evil.com", normalizeDomains("com"))).toBe(false);
  });

  it("rejects junk that could never be a hostname", () => {
    expect(normalizeDomains("not a domain, <script>, @@@")).toEqual([]);
  });

  // Deliberate carve-out: localhost is a reserved name (RFC 6761), can never
  // be a public suffix, and is the only way to test a widget locally.
  it("keeps localhost despite having no dot", () => {
    expect(normalizeDomains("http://localhost:3000")).toEqual(["localhost"]);
    expect(normalizeDomains("localhost")).toEqual(["localhost"]);
  });

  it("normalizes trailing dots and dedupes across input forms", () => {
    expect(normalizeDomains("acme.com., https://www.acme.com:443/x, ACME.COM")).toEqual([
      "acme.com",
    ]);
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
