import { MongoClient, ObjectId, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOrg, slugify } from "@/lib/orgs";
import { verifySiteKey } from "@/lib/siteKeys";

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
const userId = new ObjectId();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  db = client.db("supportai-test");
  await db.collection("users").insertOne({
    _id: userId,
    email: "owner@example.com",
    emailVerified: new Date(),
  });
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("slugify", () => {
  it("lowercases and dashes", () => {
    expect(slugify("Acme Corp!")).toBe("acme-corp");
  });
  it("never returns empty", () => {
    expect(slugify("!!!")).toBe("org");
  });
});

describe("createOrg", () => {
  it("creates org, owner membership, working site key, and sets activeOrgId", async () => {
    const { orgId, slug, siteKey } = await createOrg(db, {
      name: "Acme Corp",
      userId,
    });

    expect(slug).toBe("acme-corp");

    const org = await db.collection("organizations").findOne({ _id: orgId });
    expect(org?.name).toBe("Acme Corp");
    expect(org?.widgetConfig.position).toBe("bottom-right");
    expect(org?.emailConfig.mode).toBe("draft");
    expect(org?.widgetConfig.primaryColor).toBe("#4f46e5");
    expect(org?.widgetConfig.greeting).toBe("Hi! How can we help?");
    expect(org?.emailConfig.supportAddress).toBeNull();
    expect(org?.aiConfig.tone).toBe("friendly and concise");
    expect(org?.aiConfig.escalationRules).toBe("");
    expect(org?.aiConfig.provider).toBeNull();

    const membership = await db.collection("memberships").findOne({ userId, orgId });
    expect(membership?.role).toBe("owner");

    const keyRec = await verifySiteKey(db, siteKey, "http://localhost:3000");
    expect(keyRec?.orgId.equals(orgId)).toBe(true);

    const user = await db.collection("users").findOne({ _id: userId });
    expect(user?.activeOrgId?.equals(orgId)).toBe(true);
  });

  it("dedupes slugs with a numeric suffix", async () => {
    const second = await createOrg(db, { name: "Acme Corp", userId });
    expect(second.slug).toBe("acme-corp-2");
  });
});
