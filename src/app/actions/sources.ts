"use server";

import { del, put } from "@vercel/blob";
import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { tasks } from "@trigger.dev/sdk";
import { auth } from "@/auth";
import type { Source, SourceConfig } from "@/lib/db/types";
import { getDb } from "@/lib/db/client";
import { withOrg, type OrgDb } from "@/lib/db/withOrg";
import type { crawlWebsite } from "@/trigger/crawl-website";
import type { ingestDocument } from "@/trigger/ingest-document";
import type { importTickets } from "@/trigger/import-tickets";

export type SourceActionState = { ok?: boolean; error?: string };

const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024; // Vercel server-action body limit
const FILE_EXTENSIONS = [".pdf", ".docx", ".md", ".txt"];

async function requireOrgDb(): Promise<{ orgDb: OrgDb; orgId: ObjectId }> {
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

/** One typed trigger call per task id — a union type param does not typecheck. */
async function triggerIngestion(
  type: Source["type"],
  orgId: ObjectId,
  sourceId: ObjectId,
): Promise<{ id: string }> {
  const payload = { orgId: orgId.toString(), sourceId: sourceId.toString() };
  const opts = { tags: [`org:${orgId.toString()}`, `source:${sourceId.toString()}`] };
  if (type === "file") {
    return tasks.trigger<typeof ingestDocument>("ingest-document", payload, opts);
  }
  if (type === "ticket-import") {
    return tasks.trigger<typeof importTickets>("import-tickets", payload, opts);
  }
  return tasks.trigger<typeof crawlWebsite>("crawl-website", payload, opts);
}

async function insertAndTrigger(
  orgDb: OrgDb,
  orgId: ObjectId,
  input: { type: Source["type"]; name: string; config: SourceConfig; crawlSchedule: Source["crawlSchedule"] },
): Promise<void> {
  const res = await orgDb.insertOne("sources", {
    type: input.type,
    name: input.name,
    status: "pending",
    config: input.config,
    lastRunId: null,
    errorMessage: null,
    chunkCount: 0,
    lastSyncedAt: null,
    crawlSchedule: input.crawlSchedule,
    createdAt: new Date(),
  });
  const sourceId = res.insertedId as ObjectId;
  const handle = await triggerIngestion(input.type, orgId, sourceId);
  await orgDb.updateOne("sources", { _id: sourceId }, { $set: { lastRunId: handle.id } });
}

function validateUpload(file: unknown, allowed: string[]): { file: File } | { error: string } {
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload" };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "File is larger than 4.5 MB" };
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!allowed.includes(ext)) return { error: `Unsupported file type ${ext} — allowed: ${allowed.join(", ")}` };
  return { file };
}

export async function createFileSourceAction(
  _prev: SourceActionState,
  formData: FormData,
): Promise<SourceActionState> {
  const { orgDb, orgId } = await requireOrgDb();
  const checked = validateUpload(formData.get("file"), FILE_EXTENSIONS);
  if ("error" in checked) return { error: checked.error };
  const { file } = checked;

  const blob = await put(`sources/${orgId.toString()}/${crypto.randomUUID()}-${file.name}`, file, {
    access: "public",
  });
  await insertAndTrigger(orgDb, orgId, {
    type: "file",
    name: file.name,
    config: { kind: "file", blobUrl: blob.url, filename: file.name, contentType: file.type || "application/octet-stream" },
    crawlSchedule: null,
  });
  revalidatePath("/dashboard/sources");
  return { ok: true };
}

export async function createCrawlSourceAction(
  _prev: SourceActionState,
  formData: FormData,
): Promise<SourceActionState> {
  const { orgDb, orgId } = await requireOrgDb();
  const rootUrl = String(formData.get("rootUrl") ?? "").trim();
  try {
    const parsed = new URL(rootUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
  } catch {
    return { error: "Enter a valid http(s) URL" };
  }
  const maxPages = Math.min(Math.max(Number(formData.get("maxPages")) || 25, 1), 50);
  const scheduleRaw = String(formData.get("schedule") ?? "none");
  const crawlSchedule = scheduleRaw === "daily" || scheduleRaw === "weekly" ? scheduleRaw : null;

  await insertAndTrigger(orgDb, orgId, {
    type: "crawl",
    name: new URL(rootUrl).host,
    config: { kind: "crawl", rootUrl, maxPages, maxDepth: 2 },
    crawlSchedule,
  });
  revalidatePath("/dashboard/sources");
  return { ok: true };
}

export async function createTicketImportSourceAction(
  _prev: SourceActionState,
  formData: FormData,
): Promise<SourceActionState> {
  const { orgDb, orgId } = await requireOrgDb();
  const checked = validateUpload(formData.get("file"), [".csv", ".mbox"]);
  if ("error" in checked) return { error: checked.error };
  const { file } = checked;
  const format = file.name.toLowerCase().endsWith(".mbox") ? "mbox" : "csv";

  const blob = await put(`sources/${orgId.toString()}/${crypto.randomUUID()}-${file.name}`, file, {
    access: "public",
  });
  await insertAndTrigger(orgDb, orgId, {
    type: "ticket-import",
    name: file.name,
    config: { kind: "ticket-import", blobUrl: blob.url, filename: file.name, format },
    crawlSchedule: null,
  });
  revalidatePath("/dashboard/sources");
  return { ok: true };
}

export async function retrySourceAction(formData: FormData): Promise<void> {
  const { orgDb, orgId } = await requireOrgDb();
  const sourceId = new ObjectId(String(formData.get("sourceId")));
  const source = await orgDb.findOne("sources", { _id: sourceId });
  if (!source) throw new Error("Source not found");
  await orgDb.updateOne("sources", { _id: sourceId }, { $set: { status: "pending", errorMessage: null } });
  const handle = await triggerIngestion(source.type, orgId, sourceId);
  await orgDb.updateOne("sources", { _id: sourceId }, { $set: { lastRunId: handle.id } });
  revalidatePath("/dashboard/sources");
}

export async function deleteSourceAction(formData: FormData): Promise<void> {
  const { orgDb } = await requireOrgDb();
  const sourceId = new ObjectId(String(formData.get("sourceId")));
  const source = await orgDb.findOne("sources", { _id: sourceId });
  if (!source) return;

  const docs = await orgDb.find("documents", { sourceId }).toArray();
  if (docs.length > 0) {
    await orgDb.deleteMany("chunks", { documentId: { $in: docs.map((d) => d._id) } });
    await orgDb.deleteMany("documents", { sourceId });
  }
  if (source.config.kind === "file" || source.config.kind === "ticket-import") {
    await del(source.config.blobUrl).catch(() => {}); // blob may already be gone
  }
  await orgDb.deleteMany("sources", { _id: sourceId });
  revalidatePath("/dashboard/sources");
}
