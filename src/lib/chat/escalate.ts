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
