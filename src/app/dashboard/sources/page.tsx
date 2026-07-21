import { ObjectId } from "mongodb";
import { redirect } from "next/navigation";
import { auth as triggerAuth } from "@trigger.dev/sdk";
import { auth } from "@/auth";
import { getDb } from "@/lib/db/client";
import { withOrg } from "@/lib/db/withOrg";
import { SourcesPanel, type SerializedSource } from "./sources-panel";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const userId = new ObjectId(session.user.id);

  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: userId });
  const orgId = user?.activeOrgId as ObjectId | undefined;
  if (!orgId) redirect("/onboarding");
  const member = await db.collection("memberships").findOne({ userId, orgId });
  if (!member) redirect("/onboarding");

  const sources = await withOrg(db, orgId).find("sources").toArray();
  const serialized: SerializedSource[] = sources
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((s) => ({
      id: s._id.toString(),
      type: s.type,
      name: s.name,
      status: s.status,
      lastRunId: s.lastRunId,
      errorMessage: s.errorMessage,
      chunkCount: s.chunkCount,
      lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
      crawlSchedule: s.crawlSchedule,
    }));

  const orgTag = `org:${orgId.toString()}`;
  // Read-only token scoped to this org's ingestion runs; page reload renews it.
  const publicAccessToken = await triggerAuth.createPublicToken({
    scopes: { read: { tags: [orgTag] } },
    expirationTime: "30m",
  });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Knowledge sources</h1>
        <a href="/dashboard" className="text-sm text-gray-500 underline">
          ← Dashboard
        </a>
      </div>
      <SourcesPanel
        sources={serialized}
        orgTag={orgTag}
        publicAccessToken={publicAccessToken}
      />
    </main>
  );
}
