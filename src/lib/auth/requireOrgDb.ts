import { ObjectId } from "mongodb";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/lib/db/client";
import { withOrg, type OrgDb } from "@/lib/db/withOrg";

export async function requireOrgDb(): Promise<{ orgDb: OrgDb; orgId: ObjectId }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const userId = new ObjectId(session.user.id);
  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: userId });
  const orgId = user?.activeOrgId as ObjectId | undefined;
  if (!orgId) redirect("/onboarding");
  const member = await db.collection("memberships").findOne({ userId, orgId });
  if (!member) throw new Error("Not a member of the active organization");
  return { orgDb: withOrg(db, orgId), orgId };
}
