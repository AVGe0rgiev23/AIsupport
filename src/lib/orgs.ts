import { ObjectId, type Db } from "mongodb";
import type { Membership, Organization } from "./db/types";
import { createSiteKey } from "./siteKeys";

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "org";
}

async function uniqueSlug(db: Db, base: string): Promise<string> {
  let slug = base;
  for (let n = 2; await db.collection("organizations").findOne({ slug }); n++) {
    slug = `${base}-${n}`;
  }
  return slug;
}

export interface CreateOrgResult {
  orgId: ObjectId;
  slug: string;
  siteKey: string;
}

export async function createOrg(
  db: Db,
  opts: { name: string; userId: ObjectId },
): Promise<CreateOrgResult> {
  const slug = await uniqueSlug(db, slugify(opts.name));
  const now = new Date();
  const orgId = new ObjectId();

  await db.collection<Organization>("organizations").insertOne({
    _id: orgId,
    name: opts.name,
    slug,
    widgetConfig: {
      primaryColor: "#4f46e5",
      greeting: "Hi! How can we help?",
      position: "bottom-right",
    },
    emailConfig: { supportAddress: null, mode: "draft" },
    aiConfig: { tone: "friendly and concise", escalationRules: "", provider: null },
    createdAt: now,
  });

  await db.collection<Membership>("memberships").insertOne({
    _id: new ObjectId(),
    userId: opts.userId,
    orgId,
    role: "owner",
    createdAt: now,
  });

  const siteKey = await createSiteKey(db, orgId, "Default site key", ["localhost"]);

  await db
    .collection("users")
    .updateOne({ _id: opts.userId }, { $set: { activeOrgId: orgId } });

  return { orgId, slug, siteKey };
}
