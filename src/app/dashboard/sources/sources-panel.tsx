"use client";

import { useActionState } from "react";
import { useRealtimeRunsWithTag } from "@trigger.dev/react-hooks";
import {
  createCrawlSourceAction,
  createFileSourceAction,
  createTicketImportSourceAction,
  deleteSourceAction,
  retrySourceAction,
  type SourceActionState,
} from "@/app/actions/sources";

export interface SerializedSource {
  id: string;
  type: "file" | "url" | "crawl" | "ticket-import";
  name: string;
  status: "pending" | "processing" | "ready" | "error";
  lastRunId: string | null;
  errorMessage: string | null;
  chunkCount: number;
  lastSyncedAt: string | null;
  crawlSchedule: "daily" | "weekly" | null;
}

type RunMeta = {
  phase?: string;
  totalChunks?: number;
  embeddedChunks?: number;
  crawled?: number;
  discovered?: number;
  totalTickets?: number;
};

const TYPE_LABEL: Record<SerializedSource["type"], string> = {
  file: "File",
  url: "URL",
  crawl: "Website crawl",
  "ticket-import": "Ticket import",
};

function StatusPill({ status, live }: { status: SerializedSource["status"]; live: boolean }) {
  const styles: Record<SerializedSource["status"], string> = {
    pending: "bg-gray-100 text-gray-600",
    processing: "bg-indigo-100 text-indigo-700",
    ready: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {(status === "processing" || (status === "pending" && live)) && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-600" />
      )}
      {status}
    </span>
  );
}

function ProgressLine({ meta }: { meta: RunMeta }) {
  const total = meta.totalChunks ?? 0;
  const done = meta.embeddedChunks ?? 0;
  return (
    <div className="mt-2">
      <p className="text-xs text-gray-500">
        {meta.phase ?? "queued"}
        {meta.crawled !== undefined && ` — ${meta.crawled}/${meta.discovered ?? "?"} pages`}
        {meta.totalTickets !== undefined && ` — ${meta.totalTickets} tickets`}
        {total > 0 && ` — ${done}/${total} chunks embedded`}
      </p>
      {total > 0 && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all duration-500"
            style={{ width: `${Math.round((done / total) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function SourceRow({ source, meta, isLive }: { source: SerializedSource; meta: RunMeta | null; isLive: boolean }) {
  return (
    <li className="rounded border border-gray-300 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{source.name}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {TYPE_LABEL[source.type]}
            {source.crawlSchedule && ` · re-crawls ${source.crawlSchedule}`}
            {source.status === "ready" && ` · ${source.chunkCount} chunks`}
            {source.lastSyncedAt && ` · synced ${new Date(source.lastSyncedAt).toLocaleString()}`}
          </p>
        </div>
        <StatusPill status={source.status} live={isLive} />
      </div>

      {(source.status === "processing" || (source.status === "pending" && meta)) && meta && (
        <ProgressLine meta={meta} />
      )}

      {source.status === "error" && (
        <div className="mt-2 rounded bg-red-50 p-2">
          <p className="break-words text-xs text-red-700">{source.errorMessage ?? "Ingestion failed"}</p>
        </div>
      )}

      <div className="mt-3 flex gap-3">
        {(source.status === "error" || source.status === "ready") && (
          <form action={retrySourceAction}>
            <input type="hidden" name="sourceId" value={source.id} />
            <button className="text-xs text-indigo-700 underline">
              {source.status === "error" ? "Retry" : "Re-sync"}
            </button>
          </form>
        )}
        <form action={deleteSourceAction}>
          <input type="hidden" name="sourceId" value={source.id} />
          <button className="text-xs text-gray-500 underline">Delete</button>
        </form>
      </div>
    </li>
  );
}

function AddSourceForm({
  action,
  legend,
  children,
  submitLabel,
}: {
  action: (prev: SourceActionState, formData: FormData) => Promise<SourceActionState>;
  legend: string;
  children: React.ReactNode;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<SourceActionState, FormData>(action, {});
  return (
    <form action={formAction} className="rounded border border-gray-300 p-4">
      <h3 className="text-sm font-semibold">{legend}</h3>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
      {state.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
      {state.ok && <p className="mt-2 text-xs text-green-700">Added — ingestion started.</p>}
      <button
        disabled={pending}
        className="mt-3 rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {pending ? "Starting…" : submitLabel}
      </button>
    </form>
  );
}

export function SourcesPanel({
  sources,
  orgTag,
  publicAccessToken,
}: {
  sources: SerializedSource[];
  orgTag: string;
  publicAccessToken: string;
}) {
  const { runs } = useRealtimeRunsWithTag(orgTag, {
    accessToken: publicAccessToken,
    skipColumns: ["payload", "output"],
  });

  const metaByRunId = new Map<string, { meta: RunMeta; finished: boolean }>();
  for (const run of runs ?? []) {
    metaByRunId.set(run.id, {
      meta: (run.metadata ?? {}) as RunMeta,
      finished: !!run.finishedAt,
    });
  }

  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <AddSourceForm action={createFileSourceAction} legend="Upload a document" submitLabel="Upload & ingest">
          <input type="file" name="file" required accept=".pdf,.docx,.md,.txt" className="text-xs" />
          <p className="text-xs text-gray-500">PDF, DOCX, MD or TXT — up to 4.5 MB.</p>
        </AddSourceForm>

        <AddSourceForm action={createCrawlSourceAction} legend="Crawl a website" submitLabel="Start crawl">
          <input
            name="rootUrl"
            type="url"
            required
            placeholder="https://help.example.com"
            className="rounded border border-gray-300 p-1.5 text-sm"
          />
          <input
            name="maxPages"
            type="number"
            min={1}
            max={50}
            defaultValue={25}
            className="rounded border border-gray-300 p-1.5 text-sm"
          />
          <select name="schedule" defaultValue="none" className="rounded border border-gray-300 p-1.5 text-sm">
            <option value="none">No re-crawl</option>
            <option value="daily">Re-crawl daily</option>
            <option value="weekly">Re-crawl weekly</option>
          </select>
        </AddSourceForm>

        <AddSourceForm action={createTicketImportSourceAction} legend="Import past tickets" submitLabel="Import">
          <input type="file" name="file" required accept=".csv,.mbox" className="text-xs" />
          <p className="text-xs text-gray-500">CSV (subject/answer columns) or mbox export.</p>
        </AddSourceForm>
      </div>

      <section className="mt-8">
        <h2 className="font-semibold">Sources</h2>
        {sources.length === 0 ? (
          <div className="mt-3 rounded border border-dashed border-gray-300 p-8 text-center">
            <p className="text-sm text-gray-600">No knowledge sources yet.</p>
            <p className="mt-1 text-xs text-gray-500">
              Upload a product doc, crawl your help center, or import past tickets — the assistant
              can only answer from what you add here.
            </p>
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {sources.map((source) => {
              const live = source.lastRunId ? metaByRunId.get(source.lastRunId) : undefined;
              return (
                <SourceRow
                  key={source.id}
                  source={source}
                  meta={live?.meta ?? null}
                  isLive={!!live && !live.finished}
                />
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
