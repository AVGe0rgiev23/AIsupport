import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/client";
import { createEscalationTicket } from "@/lib/chat/escalate";
import { consumeRateLimit, rateLimitBucket } from "@/lib/chat/rateLimit";
import {
  authorizeWidgetRequest,
  capVisitorText,
  normalizeEscalationReason,
} from "@/lib/chat/widgetRequest";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const widgetToken = body?.widgetToken as string | undefined;
  const conversationIdRaw = body?.conversationId as string | undefined;
  const visitorEmail = body?.visitorEmail as string | undefined;
  // `note` used to be String(body?.note ?? "") with NO length cap, while the
  // sibling /api/chat capped visitor text at 4000 — the same anonymous caller,
  // the same class of free text, two different rules. capVisitorText applies
  // the one shared cap and refuses to stringify non-strings (an array or a
  // {toString} object must become "", never its coerced form persisted into a
  // Ticket). `reason` lands in Ticket.notes verbatim, so it is constrained to
  // the known enum rather than accepted as free text.
  const note = capVisitorText(body?.note);
  const reason = normalizeEscalationReason(body?.reason);

  // Both fields are attacker-controlled JSON: an unchecked `as string` cast
  // erases at runtime. A non-string widgetToken would otherwise reach
  // verifyWidgetToken() and throw on token.split(...); a non-string
  // visitorEmail would coerce through EMAIL_RE.test() (e.g. an array's
  // ToString) and get persisted verbatim into Ticket.visitorEmail.
  if (typeof widgetToken !== "string" || typeof visitorEmail !== "string") {
    return Response.json(
      { error: "widgetToken and visitorEmail are required" },
      { status: 400 },
    );
  }
  if (!widgetToken || !visitorEmail) {
    return Response.json(
      { error: "widgetToken and visitorEmail are required" },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(visitorEmail) || visitorEmail.length > 320) {
    return Response.json({ error: "Invalid email" }, { status: 400 });
  }
  // conversationId is optional: the widget can escalate before any
  // conversation exists (see createEscalationTicket's doc comment).
  if (conversationIdRaw && !ObjectId.isValid(conversationIdRaw)) {
    return Response.json({ error: "Invalid conversationId" }, { status: 400 });
  }

  // One guard around everything after the cheap, provably-total 400 checks —
  // same structure as the sibling /api/chat handler. env() (inside
  // authorizeWidgetRequest and below), getDb()'s Mongo connection, and every
  // query/insert/update can throw, and none may surface as a raw 500.
  try {
    const auth = authorizeWidgetRequest(req, widgetToken);
    if (!auth.ok) return auth.response;

    const conversationId = conversationIdRaw ? new ObjectId(conversationIdRaw) : null;
    const db = await getDb();

    // Same coarse per-caller throttle as /api/chat. This endpoint is an
    // unauthenticated ticket writer; createEscalationTicket now dedupes
    // replays of an already-escalated conversation, but conversation-less
    // escalations are legitimately distinct leads and have nothing to dedupe
    // against, so the rate limit is what bounds those.
    const bucket = rateLimitBucket(req.headers, widgetToken);
    const allowed = await consumeRateLimit(
      db,
      auth.orgId,
      bucket,
      env().WIDGET_RATE_LIMIT_PER_MIN,
    );
    if (!allowed) {
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }

    const ticketId = await createEscalationTicket(db, {
      orgId: auth.orgId,
      conversationId,
      visitorEmail,
      note,
      reason,
    });
    if (!ticketId) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }
    return Response.json({ ok: true, ticketId: ticketId.toString() });
  } catch (err) {
    console.error("chat escalate failed", {
      conversationId: conversationIdRaw ?? null,
      err,
    });
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }
}
