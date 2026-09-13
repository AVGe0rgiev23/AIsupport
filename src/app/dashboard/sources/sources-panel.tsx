"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useRealtimeRunsWithTag } from "@trigger.dev/react-hooks";
import {
  createCrawlSourceAction,
  createFileSourceAction,
  createTicketImportSourceAction,
  deleteSourceAction,
  retrySourceAction,
  type SourceActionState,
} from "@/app/actions/sources";
import {
  IconAlert,
  IconCheck,
  IconFile,
  IconGlobe,
  IconInbox,
  IconLibrary,
  IconLink,
  IconRefresh,
  IconTrash,
  IconUpload,
} from "@/app/_ui/icons";
import {
  Badge,
  buttonStyles,
  Callout,
  Card,
  cx,
  EmptyState,
  Field,
  focusRing,
  inputStyles,
  type Tone,
} from "@/app/_ui/primitives";
import { Spinner, SubmitButton } from "@/app/_ui/submit-button";

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

const TYPE_ICON: Record<SerializedSource["type"], typeof IconFile> = {
  file: IconFile,
  url: IconLink,
  crawl: IconGlobe,
  "ticket-import": IconInbox,
};

const STATUS: Record<SerializedSource["status"], { tone: Tone; label: string }> = {
  pending: { tone: "neutral", label: "Queued" },
  processing: { tone: "info", label: "Processing" },
  ready: { tone: "success", label: "Ready" },
  error: { tone: "danger", label: "Failed" },
};

function StatusPill({ status, live }: { status: SerializedSource["status"]; live: boolean }) {
  const s = STATUS[status];
  const animated = status === "processing" || (status === "pending" && live);
  return (
    <Badge tone={s.tone} dot pulse={animated}>
      {s.label}
    </Badge>
  );
}

function ProgressLine({ meta }: { meta: RunMeta }) {
  const total = meta.totalChunks ?? 0;
  const done = meta.embeddedChunks ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mt-4 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-3">
      <div className="flex items-center justify-between gap-3 text-xs">
        <p className="min-w-0 truncate text-cyan-100">
          <span className="font-medium capitalize">{meta.phase ?? "queued"}</span>
          <span className="text-slate-400">
            {meta.crawled !== undefined && ` · ${meta.crawled}/${meta.discovered ?? "?"} pages`}
            {meta.totalTickets !== undefined && ` · ${meta.totalTickets} tickets`}
            {total > 0 && ` · ${done}/${total} passages embedded`}
          </span>
        </p>
        {total > 0 && <span className="font-mono text-cyan-200">{pct}%</span>}
      </div>
      {total > 0 && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-linear-to-r from-cyan-400 to-violet-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function SourceRow({ source, meta, isLive }: { source: SerializedSource; meta: RunMeta | null; isLive: boolean }) {
  const Icon = TYPE_ICON[source.type];
  return (
    <li className="group p-4 transition hover:bg-white/[0.02] sm:p-5">
      <div className="flex items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300">
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="min-w-0 truncate font-medium text-white">{source.name}</p>
            <StatusPill status={source.status} live={isLive} />
          </div>
          <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-500">
            <span>{TYPE_LABEL[source.type]}</span>
            {source.crawlSchedule && <span>· re-crawls {source.crawlSchedule}</span>}
            {source.status === "ready" && <span>· {source.chunkCount} passages</span>}
            {source.lastSyncedAt && (
              <span suppressHydrationWarning>· synced {new Date(source.lastSyncedAt).toLocaleString()}</span>
            )}
          </p>

          {(source.status === "processing" || (source.status === "pending" && meta)) && meta && (
            <ProgressLine meta={meta} />
          )}

          {source.status === "error" && (
            <Callout tone="danger" icon={IconAlert} className="mt-4">
              <span className="break-words">{source.errorMessage ?? "Ingestion failed"}</span>
            </Callout>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {(source.status === "error" || source.status === "ready") && (
            <form action={retrySourceAction}>
              <input type="hidden" name="sourceId" value={source.id} />
              <SubmitButton variant="ghost" size="sm" pendingLabel="Starting…">
                <IconRefresh className="size-3.5" />
                <span className="max-sm:sr-only">{source.status === "error" ? "Retry" : "Re-sync"}</span>
              </SubmitButton>
            </form>
          )}
          <form
            action={deleteSourceAction}
            onSubmit={(e) => {
              if (!window.confirm(`Delete “${source.name}”? The assistant will forget everything it learned from it.`)) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="sourceId" value={source.id} />
            <SubmitButton variant="danger" size="sm" pendingLabel="Deleting…">
              <IconTrash className="size-3.5" />
              <span className="sr-only">Delete</span>
            </SubmitButton>
          </form>
        </div>
      </div>
    </li>
  );
}

function FileDrop({ accept, hint }: { accept: string; hint: string }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // React resets uncontrolled form fields after a successful action; clear the
  // displayed name when that happens.
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const onReset = () => setFileName(null);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  return (
    <label
      className={cx(
        "relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-8 text-center transition focus-within:border-cyan-300/60",
        fileName ? "border-cyan-300/40 bg-cyan-400/[0.04]" : "border-white/15 hover:border-white/30 hover:bg-white/[0.02]",
      )}
    >
      <input
        ref={input}
        type="file"
        name="file"
        required
        accept={accept}
        onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
      <span
        className={cx(
          "grid size-11 place-items-center rounded-xl border",
          fileName ? "border-cyan-300/30 bg-cyan-400/10 text-cyan-200" : "border-white/10 bg-white/[0.04] text-slate-400",
        )}
      >
        {fileName ? <IconCheck className="size-5" strokeWidth={2.25} /> : <IconUpload className="size-5" />}
      </span>
      {fileName ? (
        <span className="mt-3 max-w-full truncate text-sm font-medium text-white">{fileName}</span>
      ) : (
        <span className="mt-3 text-sm text-slate-300">
          <span className="font-medium text-white">Choose a file</span> or drag it here
        </span>
      )}
      <span className="mt-1 text-xs text-slate-500">{hint}</span>
    </label>
  );
}

function AddSourceForm({
  action,
  children,
  submitLabel,
}: {
  action: (prev: SourceActionState, formData: FormData) => Promise<SourceActionState>;
  children: ReactNode;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<SourceActionState, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-4">
      {children}
      {state.error && (
        <Callout tone="danger" icon={IconAlert}>
          {state.error}
        </Callout>
      )}
      {state.ok && (
        <Callout tone="success" icon={IconCheck}>
          Added. Ingestion has started, and progress shows up below.
        </Callout>
      )}
      <div className="flex justify-end">
        <button disabled={pending} className={buttonStyles("primary")}>
          {pending && <Spinner />}
          {pending ? "Starting…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

const TABS = [
  { id: "file", label: "Upload a document", short: "Document", icon: IconFile },
  { id: "crawl", label: "Crawl a website", short: "Website", icon: IconGlobe },
  { id: "tickets", label: "Import past tickets", short: "Tickets", icon: IconInbox },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SourcesPanel({
  sources,
  orgTag,
  publicAccessToken,
}: {
  sources: SerializedSource[];
  orgTag: string;
  publicAccessToken: string;
}) {
  const [tab, setTab] = useState<TabId>("file");
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
      <Card>
        <div className="border-b border-white/[0.06] px-2 pt-2 sm:px-3">
          <div role="tablist" aria-label="Add knowledge" className="flex gap-1">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={active}
                  aria-controls={`panel-${t.id}`}
                  onClick={() => setTab(t.id)}
                  className={cx(
                    "relative flex items-center gap-2 whitespace-nowrap rounded-t-lg px-3.5 py-3 text-sm font-medium transition max-sm:flex-1 max-sm:justify-center max-sm:gap-1.5 max-sm:px-1.5",
                    focusRing,
                    active ? "text-white" : "text-slate-500 hover:text-slate-200",
                  )}
                >
                  <t.icon className={cx("size-4", active ? "text-cyan-300" : "")} />
                  <span className="sm:hidden">{t.short}</span>
                  <span className="max-sm:hidden">{t.label}</span>
                  {active && (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-linear-to-r from-cyan-300 to-violet-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {tab === "file" && (
            <div role="tabpanel" id="panel-file" aria-labelledby="tab-file">
              <AddSourceForm action={createFileSourceAction} submitLabel="Upload & ingest">
                <FileDrop accept=".pdf,.docx,.md,.txt" hint="PDF, DOCX, Markdown or TXT, up to 4.5 MB" />
              </AddSourceForm>
            </div>
          )}

          {tab === "crawl" && (
            <div role="tabpanel" id="panel-crawl" aria-labelledby="tab-crawl">
              <AddSourceForm action={createCrawlSourceAction} submitLabel="Start crawl">
                <Field label="Website address" htmlFor="rootUrl" hint="Uses the sitemap when there is one, otherwise follows links two levels deep.">
                  <input
                    id="rootUrl"
                    name="rootUrl"
                    type="url"
                    required
                    placeholder="https://help.example.com"
                    className={inputStyles}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Page limit" htmlFor="maxPages" hint="Between 1 and 50 pages.">
                    <input
                      id="maxPages"
                      name="maxPages"
                      type="number"
                      min={1}
                      max={50}
                      defaultValue={25}
                      className={inputStyles}
                    />
                  </Field>
                  <Field label="Keep it fresh" htmlFor="schedule" hint="Unchanged pages are skipped on re-crawl.">
                    <select id="schedule" name="schedule" defaultValue="none" className={cx(inputStyles, "appearance-auto")}>
                      <option value="none">No re-crawl</option>
                      <option value="daily">Re-crawl daily</option>
                      <option value="weekly">Re-crawl weekly</option>
                    </select>
                  </Field>
                </div>
              </AddSourceForm>
            </div>
          )}

          {tab === "tickets" && (
            <div role="tabpanel" id="panel-tickets" aria-labelledby="tab-tickets">
              <AddSourceForm action={createTicketImportSourceAction} submitLabel="Import tickets">
                <FileDrop accept=".csv,.mbox" hint="CSV with subject/answer columns, or an mbox export" />
              </AddSourceForm>
            </div>
          )}
        </div>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Your sources</h2>
        {sources.length === 0 ? (
          <EmptyState icon={IconLibrary} title="No knowledge sources yet">
            Upload a product doc, crawl your help center, or import past tickets. The assistant can
            only answer from what you add here.
          </EmptyState>
        ) : (
          <Card>
            <ul className="divide-y divide-white/[0.06]">
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
          </Card>
        )}
      </section>
    </>
  );
}
