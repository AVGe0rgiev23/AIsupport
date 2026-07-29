import type { Db, ObjectId } from "mongodb";
import { withOrg } from "@/lib/db/withOrg";

export interface EscalateInput {
  orgId: ObjectId;
  /** Null when the widget failed before a conversation was ever created
   *  (e.g. an expired token on the first message) — the lead is still worth
   *  capturing, and Ticket.conversationId is nullable by design. */
  conversationId: ObjectId | null;
  visitorEmail: string;
  note: string;
  reason: string;
}

export async function createEscalationTicket(
  db: Db,
  input: EscalateInput,
): Promise<ObjectId | null> {
  const orgDb = withOrg(db, input.orgId);

  if (input.conversationId) {
    // withOrg scopes this by orgId, so a conversation belonging to another
    // tenant reads as missing — never escalate across an org boundary.
    const conversation = await orgDb.findOne("conversations", { _id: input.conversationId });
    if (!conversation) return null;

    // POST /api/chat/escalate is unauthenticated, so N replays of the same
    // conversationId would otherwise file N tickets against one conversation.
    // Once the conversation is already escalated, hand back the ticket that
    // exists rather than inserting another. (Still scoped through orgDb, so
    // the lookup cannot reach another tenant's ticket.) A conversation-less
    // escalation has nothing to dedupe against and is left alone below — each
    // one is a distinct lead.
    if (conversation.status === "escalated") {
      const existing = await orgDb.findOne("tickets", { conversationId: input.conversationId });
      if (existing) return existing._id;
    }
  }

  const now = new Date();
  const res = await orgDb.insertOne("tickets", {
    conversationId: input.conversationId,
    visitorEmail: input.visitorEmail,
    question: input.note || input.reason,
    status: "open",
    assignee: null,
    notes: input.reason,
    createdAt: now,
    updatedAt: now,
  });
  if (input.conversationId) {
    await orgDb.updateOne(
      "conversations",
      { _id: input.conversationId },
      { $set: { status: "escalated", updatedAt: now } },
    );
  }
  return res.insertedId as ObjectId;
}
