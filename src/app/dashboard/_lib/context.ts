import { ObjectId } from "mongodb";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import { getDb } from "@/lib/db/client";
import type { Membership, Organization } from "@/lib/db/types";

/**
 * The signed-in user, their organizations and the active one.
 *
 * Wrapped in React's cache() so the dashboard layout (sidebar, org switcher)
 * and the overview page share one set of queries per request. The resolution
 * rules are the ones the overview page has always used: no session goes to
 * /signin, no memberships goes to /onboarding, and a stale or missing
 * users.activeOrgId falls back to the first membership.
 */
export const getDashboardContext = cache(async () => {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const userId = new ObjectId(session.user.id);

  const db = await getDb();
  const memberships = await db
    .collection<Membership>("memberships")
    .find({ userId })
    .toArray();
  if (memberships.length === 0) redirect("/onboarding");

  const user = await db.collection("users").findOne({ _id: userId });
  const fromUser = user?.activeOrgId as ObjectId | undefined;
  const activeOrgId =
    fromUser && memberships.some((m) => m.orgId.equals(fromUser))
      ? fromUser
      : memberships[0].orgId;

  const orgs = await db
    .collection<Organization>("organizations")
    .find({ _id: { $in: memberships.map((m) => m.orgId) } })
    .toArray();
  const activeOrg = orgs.find((o) => o._id.equals(activeOrgId))!;

  return {
    db,
    userId,
    email: session.user.email ?? "",
    name: session.user.name ?? null,
    orgs,
    activeOrgId,
    activeOrg,
  };
});
