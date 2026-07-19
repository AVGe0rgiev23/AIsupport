"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/lib/db/client";
import { withOrg } from "@/lib/db/withOrg";
import { createOrg } from "@/lib/orgs";

async function requireUserId(): Promise<ObjectId> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return new ObjectId(session.user.id);
}

export type CreateOrgState = {
  siteKey?: string;
  orgName?: string;
  error?: string;
};

export async function createOrgAction(
  _prev: CreateOrgState,
  formData: FormData,
): Promise<CreateOrgState> {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Organization name is required" };
  const db = await getDb();
  const { siteKey } = await createOrg(db, { name, userId });
  return { siteKey, orgName: name };
}

export async function setActiveOrgAction(formData: FormData) {
  const userId = await requireUserId();
  const orgId = new ObjectId(String(formData.get("orgId")));
  const db = await getDb();
  const member = await db.collection("memberships").findOne({ userId, orgId });
  if (!member) throw new Error("Not a member of that organization");
  await db
    .collection("users")
    .updateOne({ _id: userId }, { $set: { activeOrgId: orgId } });
  revalidatePath("/dashboard");
}

export async function addTestTicketAction() {
  const userId = await requireUserId();
  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: userId });
  const activeOrgId = user?.activeOrgId as ObjectId | undefined;
  if (!activeOrgId) throw new Error("No active organization");
  const member = await db
    .collection("memberships")
    .findOne({ userId, orgId: activeOrgId });
  if (!member) throw new Error("Not a member of that organization");

  const now = new Date();
  await withOrg(db, activeOrgId).insertOne("tickets", {
    conversationId: null,
    visitorEmail: "visitor@example.com",
    question: `Test ticket created at ${now.toISOString()}`,
    status: "open",
    assignee: null,
    notes: "",
    createdAt: now,
    updatedAt: now,
  });
  revalidatePath("/dashboard");
}
