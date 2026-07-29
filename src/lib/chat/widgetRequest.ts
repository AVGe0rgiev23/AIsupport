import { ObjectId } from "mongodb";
import { env } from "@/lib/env";
import { verifyWidgetToken, type WidgetTokenPayload } from "@/lib/widgetToken";

/** One cap for every free-text field a visitor can push through the widget.
 *  /api/chat's `message` and /api/chat/escalate's `note` are the same class of
 *  input from the same anonymous caller and must not drift apart again. */
export const MAX_VISITOR_TEXT_LENGTH = 4000;

/** The complete set of escalation reasons the widget and routes produce:
 *  `model_requested` (escalate_to_human tool call), `quota` (daily cap),
 *  `error` (pre-stream failure / transport error), `user_requested` (visitor
 *  dismissed into the form), `provider_exhausted` (both providers failed). */
export const ESCALATION_REASONS = [
  "model_requested",
  "quota",
  "error",
  "user_requested",
  "provider_exhausted",
] as const;

export type EscalationReason = (typeof ESCALATION_REASONS)[number];

/** `reason` is persisted verbatim into Ticket.notes by an unauthenticated
 *  endpoint. Constrain it to the known enum rather than accepting free text of
 *  arbitrary length. */
export function normalizeEscalationReason(raw: unknown): EscalationReason {
  return (ESCALATION_REASONS as readonly string[]).includes(raw as string)
    ? (raw as EscalationReason)
    : "user_requested";
}

/** Truncates visitor free text, and refuses to stringify non-strings — an
 *  attacker-supplied array or `{toString}` object must become "", never its
 *  coerced representation persisted into a Ticket. */
export function capVisitorText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.slice(0, MAX_VISITOR_TEXT_LENGTH);
}

/** Request.json() parses a body regardless of Content-Type, so a malicious
 *  page can POST to these routes with `Content-Type: text/plain` as a CORS
 *  *simple* request: no preflight, the response is unreadable to them, but the
 *  write still lands. Every visitor to that page becomes a request source,
 *  which defeats IP-keyed throttling and turns a flood into a distributed one.
 *
 *  The widget is a same-origin iframe, so the only legitimate Origin is our
 *  own. An ABSENT Origin is still allowed on purpose: non-browser callers
 *  (health checks, the manual curl verification) send none, and rejecting
 *  those would break them without stopping any browser-driven attack —
 *  browsers always attach Origin to a cross-site POST. */
export function isSameSiteRequest(
  req: Request,
  appOrigin: string = env().APP_URL,
): boolean {
  const origin = req.headers.get("origin");
  if (origin === null) return true;
  let expected: string;
  try {
    expected = new URL(appOrigin).origin;
  } catch {
    return false;
  }
  // A literal "null" Origin (sandboxed iframe, data:/file: document) is opaque
  // and never ours — URL parsing would throw on it anyway, but be explicit.
  return origin === expected;
}

export type WidgetAuth =
  | { ok: true; payload: WidgetTokenPayload; orgId: ObjectId }
  | { ok: false; response: Response };

/** Shared front door for both widget endpoints: cross-site rejection, token
 *  verification, and orgId construction in one place.
 *
 *  Total by construction — it cannot throw for any input (`verifyWidgetToken`
 *  is total for strings, and the ObjectId is only constructed behind
 *  `isValid`), which is what keeps `new ObjectId(payload.orgId)` from being
 *  yet another throwable expression the routes have to remember to guard.
 *  Note the two routes previously diverged on all three of these checks; they
 *  now cannot. */
export function authorizeWidgetRequest(req: Request, widgetToken: string): WidgetAuth {
  if (!isSameSiteRequest(req)) {
    return {
      ok: false,
      response: Response.json({ error: "Cross-site request rejected" }, { status: 403 }),
    };
  }

  const payload = verifyWidgetToken(widgetToken);
  // isWidgetTokenPayload only guarantees orgId is a *string*, not a valid
  // 24-hex id. mintWidgetToken always writes `.toString()` of a real ObjectId,
  // so this is unreachable via a legitimately signed token — but validating it
  // here is what makes that guarantee structural instead of incidental.
  if (!payload || !ObjectId.isValid(payload.orgId)) {
    return {
      ok: false,
      response: Response.json({ error: "Invalid or expired widget session" }, { status: 401 }),
    };
  }

  return { ok: true, payload, orgId: new ObjectId(payload.orgId) };
}
