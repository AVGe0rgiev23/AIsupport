import type { Metadata } from "next";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { addTestTicketAction } from "@/app/actions/orgs";
import {
  IconArrowRight,
  IconCheck,
  IconDatabase,
  IconGauge,
  IconGlobe,
  IconHandoff,
  IconInbox,
  IconLibrary,
  IconMessages,
  IconPlus,
  IconSliders,
} from "@/app/_ui/icons";
import { Badge, buttonStyles, Card, CardHeader, cx, EmptyState, PageHeader, type Tone } from "@/app/_ui/primitives";
import { SubmitButton } from "@/app/_ui/submit-button";
import { withOrg } from "@/lib/db/withOrg";
import { env } from "@/lib/env";
import { getTodayUsage } from "@/lib/llmUsage";
import { getDashboardContext } from "./_lib/context";
import { formatNumber, plural, timeAgo } from "./_lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Overview" };

const TICKET_TONE: Record<string, Tone> = { open: "warning", answered: "info", closed: "neutral" };

export default async function DashboardPage() {
  const { db, activeOrgId, activeOrg } = await getDashboardContext();
  const orgDb = withOrg(db, activeOrgId);

  const [sources, ticketCount, conversationCount, recentTickets, apiKey, usedToday] = await Promise.all([
    orgDb.find("sources").toArray(),
    orgDb.countDocuments("tickets"),
    orgDb.countDocuments("conversations"),
    orgDb.find("tickets", {}, { sort: { createdAt: -1 }, limit: 5 }).toArray(),
    orgDb.findOne("apiKeys"),
    getTodayUsage(db, activeOrgId),
  ]);

  // The cap is a global env setting; if the environment is misconfigured the
  // chat route is already failing closed, so the budget card just omits it.
  let cap: number | null = null;
  try {
    cap = env().WIDGET_DAILY_MSG_CAP;
  } catch {}

  const ready = sources.filter((s) => s.status === "ready").length;
  const inFlight = sources.filter((s) => s.status === "pending" || s.status === "processing").length;
  const failed = sources.filter((s) => s.status === "error").length;
  const passages = sources.reduce((sum, s) => sum + (s.chunkCount ?? 0), 0);
  const domains = apiKey?.allowedDomains ?? [];
  const liveDomains = domains.filter((d) => d !== "localhost");

  const steps = [
    {
      title: "Create your organization",
      body: `${activeOrg.name} is set up and has its own private knowledge base.`,
      done: true,
    },
    {
      title: "Teach it your business",
      body:
        ready > 0
          ? `${plural(ready, "source")} ready, ${plural(passages, "passage")} indexed.`
          : inFlight > 0
            ? "Your first source is being processed right now."
            : "Upload a doc, crawl your help center or import past tickets.",
      done: ready > 0,
      cta: { href: "/dashboard/sources", label: "Add knowledge" },
    },
    {
      title: "Approve your website",
      body:
        liveDomains.length > 0
          ? `The widget can run on ${liveDomains.join(", ")}.`
          : "Only localhost can load the widget right now.",
      done: liveDomains.length > 0,
      cta: { href: "/dashboard/settings", label: "Add a domain" },
    },
    {
      title: "Install the widget",
      body:
        conversationCount > 0
          ? `${plural(conversationCount, "conversation")} so far. It's live.`
          : "Paste the snippet on your site and ask it something.",
      done: conversationCount > 0,
      cta: { href: "/dashboard/settings", label: "Get the snippet" },
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  const pct = cap ? Math.min(100, Math.round((usedToday / cap) * 100)) : 0;
  const budgetTone = pct >= 100 ? "bg-rose-400" : pct >= 75 ? "bg-amber-300" : "bg-linear-to-r from-cyan-400 to-violet-400";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Overview"
        title={activeOrg.name}
        description="Your support teammate at a glance."
        actions={
          <>
            <Link href="/dashboard/settings" className={buttonStyles("secondary")}>
              <IconSliders className="size-4" />
              Widget
            </Link>
            <Link href="/dashboard/sources" className={buttonStyles("primary")}>
              <IconPlus className="size-4" />
              Add knowledge
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={IconLibrary}
          label="Knowledge sources"
          value={formatNumber(sources.length)}
          note={
            sources.length === 0
              ? "Nothing added yet"
              : [`${ready} ready`, inFlight && `${inFlight} in progress`, failed && `${failed} failed`]
                  .filter(Boolean)
                  .join(" · ")
          }
        />
        <Stat icon={IconDatabase} label="Passages indexed" value={formatNumber(passages)} note="Searchable by the assistant" />
        <Stat icon={IconMessages} label="Conversations" value={formatNumber(conversationCount)} note="Since the widget went live" />
        <Stat icon={IconHandoff} label="Hand-offs" value={formatNumber(ticketCount)} note="Tickets for your team" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Get set up"
            description="Four steps from zero to answering customers."
            action={
              <Badge tone={doneCount === steps.length ? "success" : "violet"}>
                {doneCount} of {steps.length}
              </Badge>
            }
          />
          <div className="px-5 pt-4 sm:px-6">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-linear-to-r from-cyan-400 via-violet-400 to-pink-400 transition-[width] duration-700"
                style={{ width: `${(doneCount / steps.length) * 100}%` }}
              />
            </div>
          </div>
          <ol className="divide-y divide-white/[0.06] px-5 pb-2 sm:px-6">
            {steps.map((step, i) => (
              <li key={step.title} className="flex items-start gap-4 py-4">
                <span
                  className={cx(
                    "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                    step.done ? "bg-emerald-400 text-slate-950" : "border border-white/15 text-slate-400",
                  )}
                >
                  {step.done ? <IconCheck className="size-4" strokeWidth={2.75} /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cx("font-medium", step.done ? "text-slate-300" : "text-white")}>{step.title}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{step.body}</p>
                </div>
                {!step.done && step.cta && (
                  <Link href={step.cta.href} className={cx(buttonStyles("secondary", "sm"), "mt-0.5")}>
                    {step.cta.label}
                    <IconArrowRight className="size-3.5" />
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </Card>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader icon={IconGauge} title="Today's AI budget" description="Resets at midnight UTC." />
            <div className="px-5 py-5 sm:px-6">
              <p className="flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight text-white">{formatNumber(usedToday)}</span>
                {cap !== null && <span className="text-slate-500">/ {formatNumber(cap)} units</span>}
              </p>
              {cap !== null && (
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className={cx("h-full rounded-full", budgetTone)} style={{ width: `${pct}%` }} />
                </div>
              )}
              <p className="mt-4 text-sm leading-relaxed text-slate-400">
                Each visitor message uses two units: one to search your knowledge, one to write the
                answer.{" "}
                {pct >= 100 && (
                  <span className="text-rose-300">
                    The cap is reached, so new visitors see the hand-off form until it resets.
                  </span>
                )}
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={IconGlobe}
              title="Allowed domains"
              action={
                <Link href="/dashboard/settings" className={buttonStyles("ghost", "sm")}>
                  Manage
                </Link>
              }
            />
            <div className="flex flex-wrap gap-2 px-5 py-4 sm:px-6">
              {domains.length === 0 ? (
                <p className="text-sm text-slate-500">No domains yet.</p>
              ) : (
                domains.map((d) => (
                  <Badge key={d} tone={d === "localhost" ? "neutral" : "info"} dot={d !== "localhost"}>
                    {d}
                  </Badge>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader
          icon={IconInbox}
          title="Recent hand-offs"
          description="Conversations the assistant passed to a person."
          action={ticketCount > 0 ? <Badge tone="warning">{formatNumber(ticketCount)} total</Badge> : undefined}
        />
        <div className="px-5 py-4 sm:px-6">
          {recentTickets.length === 0 ? (
            <EmptyState icon={IconInbox} title="No hand-offs yet">
              When the assistant needs a person, the visitor&apos;s email and question land here.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {recentTickets.map((t) => (
                <li key={t._id.toString()} className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:gap-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.06] text-xs font-semibold uppercase text-slate-300 max-sm:hidden">
                    {t.visitorEmail.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{t.visitorEmail}</p>
                    <p className="truncate text-sm text-slate-500">{t.question || t.notes || "No message left"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={TICKET_TONE[t.status] ?? "neutral"}>{t.status}</Badge>
                    <time dateTime={t.createdAt.toISOString()} className="whitespace-nowrap text-xs text-slate-500">
                      {timeAgo(t.createdAt)}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-white/[0.06] px-5 py-3.5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>A full inbox with transcripts and email replies is the next phase on the roadmap.</p>
          <form action={addTestTicketAction}>
            <SubmitButton variant="ghost" size="sm" pendingLabel="Adding…">
              <IconPlus className="size-3.5" />
              Add test ticket
            </SubmitButton>
          </form>
        </div>
      </Card>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{label}</p>
        <span className="grid size-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-cyan-300">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 truncate text-xs text-slate-500">{note}</p>
    </Card>
  );
}
