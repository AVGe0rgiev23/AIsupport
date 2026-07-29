import { createHash } from "crypto";
import type { Db, ObjectId } from "mongodb";
import { withOrg } from "@/lib/db/withOrg";

/** Fixed window length. Short enough that a tripped throttle self-heals for a
 *  real visitor within a minute, long enough that the counter write is
 *  amortised across a burst. */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** Size of the hashed caller space. This is the load-bearing number: without
 *  it, an actor rotating spoofed IP headers would create one counter document
 *  per request and the throttle would become a bigger write amplifier than the
 *  thing it guards. 256 buckets caps the throttle store at 256 tiny docs per
 *  org per window (TTL-reaped), while collisions only ever over-throttle —
 *  and two unrelated visitors of the same tenant would both have to exceed
 *  the limit inside the same minute in the same bucket to notice. */
export const RATE_LIMIT_BUCKETS = 256;

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === 11000
  );
}

/** Best-effort client IP.
 *
 *  On Vercel both of these are set by the platform on the way in and overwrite
 *  anything the client sent, so they are trustworthy there. Behind no proxy at
 *  all neither header exists and we fall back to the widget token — which is
 *  per-page-load rather than per-caller, so it is a weaker signal, but the
 *  bucket cap above means even a fully spoofed key space cannot cost more than
 *  RATE_LIMIT_BUCKETS documents. The hard bound on writes is the per-org daily
 *  cap in /api/chat, which now gates every insert; this throttle is
 *  defence-in-depth in front of it. */
function callerIdentity(headers: Headers, widgetToken: string): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return `ip:${realIp}`;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return `ip:${forwarded}`;
  return `tok:${widgetToken}`;
}

export function rateLimitBucket(headers: Headers, widgetToken: string): string {
  const digest = createHash("sha256").update(callerIdentity(headers, widgetToken)).digest();
  return (digest[0] % RATE_LIMIT_BUCKETS).toString(16).padStart(2, "0");
}

/** Atomically increments this caller's counter for the current window and
 *  reports whether the request is still within `limit`.
 *
 *  Same Mongo counter pattern as src/lib/llmUsage.ts (upsert + `$inc`, with
 *  the same E11000 retry for the first-of-window race) — no new service, per
 *  the $0/month constraint.
 *
 *  Fails OPEN: if the counter store itself errors, a Mongo blip must not lock
 *  every visitor out of the widget. The daily cap is what enforces the real
 *  ceiling; this is a speed bump. */
export async function consumeRateLimit(
  db: Db,
  orgId: ObjectId,
  bucket: string,
  limit: number,
  now: number = Date.now(),
): Promise<boolean> {
  const orgDb = withOrg(db, orgId);
  const window = Math.floor(now / RATE_LIMIT_WINDOW_MS);
  const filter = { bucket, window };
  const update = {
    $inc: { count: 1 },
    $setOnInsert: { expiresAt: new Date((window + 2) * RATE_LIMIT_WINDOW_MS) },
  };
  const options = { upsert: true, returnDocument: "after" as const };

  try {
    let doc;
    try {
      doc = await orgDb.findOneAndUpdate("widgetRateLimit", filter, update, options);
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      // Lost the upsert race against a concurrent first-of-window call; the
      // row exists now, so a plain update applies the increment.
      doc = await orgDb.findOneAndUpdate("widgetRateLimit", filter, update, {
        returnDocument: "after",
      });
    }
    return (doc?.count ?? 1) <= limit;
  } catch (err) {
    console.error("widget rate limit check failed — failing open", {
      orgId: orgId.toString(),
      bucket,
      err,
    });
    return true;
  }
}
