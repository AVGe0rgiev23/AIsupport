import { ObjectId } from "mongodb";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import {
  addTestTicketAction,
  setActiveOrgAction,
} from "@/app/actions/orgs";
import { getDb } from "@/lib/db/client";
import type { Membership, Organization } from "@/lib/db/types";
import { withOrg } from "@/lib/db/withOrg";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
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
  const ticketCount = await withOrg(db, activeOrgId).countDocuments("tickets");

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{activeOrg.name}</h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <button className="text-sm text-gray-500 underline">Sign out</button>
        </form>
      </div>

      <section className="mt-6 rounded border border-gray-300 p-4">
        <h2 className="font-semibold">
          Tickets in this organization: {ticketCount}
        </h2>
        <form action={addTestTicketAction} className="mt-2">
          <button className="rounded bg-indigo-600 px-3 py-2 text-sm text-white">
            Add test ticket
          </button>
        </form>
      </section>

      <section className="mt-6 rounded border border-gray-300 p-4">
        <h2 className="font-semibold">Your organizations</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {orgs.map((org) => (
            <li key={org._id.toString()} className="flex items-center gap-3">
              <span>{org.name}</span>
              {org._id.equals(activeOrgId) ? (
                <span className="text-xs text-green-700">active</span>
              ) : (
                <form action={setActiveOrgAction}>
                  <input
                    type="hidden"
                    name="orgId"
                    value={org._id.toString()}
                  />
                  <button className="text-xs underline">switch</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        <a
          href="/onboarding"
          className="mt-3 inline-block text-sm underline"
        >
          + Create another organization
        </a>
      </section>
    </main>
  );
}
