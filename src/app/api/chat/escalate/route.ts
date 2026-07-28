import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/client";
import { verifyWidgetToken } from "@/lib/widgetToken";
import { createEscalationTicket } from "@/lib/chat/escalate";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const widgetToken = body?.widgetToken as string | undefined;
  const conversationIdRaw = body?.conversationId as string | undefined;
  const visitorEmail = body?.visitorEmail as string | undefined;
  const note = String(body?.note ?? "");
  const reason = String(body?.reason ?? "user_requested");

  if (!widgetToken || !visitorEmail) {
    return Response.json(
      { error: "widgetToken and visitorEmail are required" },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(visitorEmail)) {
    return Response.json({ error: "Invalid email" }, { status: 400 });
  }
  // conversationId is optional: the widget can escalate before any
  // conversation exists (see createEscalationTicket's doc comment).
  if (conversationIdRaw && !ObjectId.isValid(conversationIdRaw)) {
    return Response.json({ error: "Invalid conversationId" }, { status: 400 });
  }

  const payload = verifyWidgetToken(widgetToken);
  if (!payload) {
    return Response.json({ error: "Invalid or expired widget session" }, { status: 401 });
  }

  const orgId = new ObjectId(payload.orgId);
  const conversationId = conversationIdRaw ? new ObjectId(conversationIdRaw) : null;

  // Mirrors the /api/chat house pattern: DB/network work (getDb()'s Mongo
  // connection, a Mongo hiccup on the lookup/insert/update) must never
  // surface as a raw 500 to the visitor.
  try {
    const db = await getDb();
    const ticketId = await createEscalationTicket(db, {
      orgId,
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
      orgId: orgId.toString(),
      conversationId: conversationId ? conversationId.toString() : null,
      err,
    });
    return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
  }
}
