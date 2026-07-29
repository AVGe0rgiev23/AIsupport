import { createHash, randomBytes } from "crypto";
import type { Db, ObjectId } from "mongodb";
import type { ApiKey } from "./db/types";

export function generateSiteKey(): string {
  return "pk_" + randomBytes(24).toString("base64url");
}

export function hashSiteKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// isOriginAllowed compares against `new URL(origin).hostname` — a bare
// hostname, never a URL. Anything a customer naturally pastes into the
// settings form ("https://acme.com", "acme.com:3000", "www.acme.com") would
// otherwise save as a value that can NEVER match, and the only symptom is the
// widget rendering "This widget isn't authorized for this domain" with no
// diagnostic anywhere. Reduce every accepted form to the hostname instead.
function normalizeDomain(raw: string): string | null {
  let domain = raw.trim().toLowerCase();
  if (!domain) return null;

  domain = domain.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme
  domain = domain.split(/[/?#]/, 1)[0]; // path, query, fragment
  domain = domain.replace(/^[^@]*@/, ""); // userinfo
  domain = domain.split(":", 1)[0]; // port
  domain = domain.replace(/^\*\./, ""); // wildcard form — subdomains are implicit
  domain = domain.replace(/^www\./, ""); // www.acme.com and acme.com are one entry
  domain = domain.replace(/\.+$/, ""); // fully-qualified trailing dot
  if (!domain) return null;

  // Hostname charset only. Rejects "not a domain", "<script>", IPv6 literals,
  // and anything else that could not come back out of URL.hostname.
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(domain)) return null;
  if (domain.includes("..")) return null;

  // localhost is a reserved name (RFC 6761) that can never be a public suffix,
  // and is the only way to exercise a widget locally — keep it despite the
  // no-dot rule below.
  if (domain === "localhost") return domain;

  // A bare TLD is an allow-all: isOriginAllowed's `host.endsWith("." + d)`
  // makes a stored "com" match https://evil.com for that tenant.
  if (!domain.includes(".")) return null;

  return domain;
}

export function normalizeDomains(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const domain = normalizeDomain(part);
    if (domain) seen.add(domain);
  }
  return [...seen];
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
