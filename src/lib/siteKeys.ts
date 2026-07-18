import { createHash, randomBytes } from "crypto";
import type { Db, ObjectId } from "mongodb";
import type { ApiKey } from "./db/types";

export function generateSiteKey(): string {
  return "pk_" + randomBytes(24).toString("base64url");
}

export function hashSiteKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function createSiteKey(
  db: Db,
  orgId: ObjectId,
  label: string,
  allowedDomains: string[],
): Promise<string> {
  const key = generateSiteKey();
  await db.collection<ApiKey>("apiKeys").insertOne({
    orgId,
    hashedKey: hashSiteKey(key),
    label,
    allowedDomains,
    createdAt: new Date(),
  } as ApiKey);
  return key;
}

export function isOriginAllowed(
  origin: string,
  allowedDomains: string[],
): boolean {
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  return allowedDomains.some((d) => host === d || host.endsWith("." + d));
}

export async function verifySiteKey(
  db: Db,
  key: string,
  origin: string | null,
): Promise<ApiKey | null> {
  const record = await db
    .collection<ApiKey>("apiKeys")
    .findOne({ hashedKey: hashSiteKey(key) });
  if (!record || origin === null) return null;
  return isOriginAllowed(origin, record.allowedDomains) ? record : null;
}
