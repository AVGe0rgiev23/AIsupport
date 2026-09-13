import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CopySnippet } from "@/app/_landing/copy-snippet";
import { readableOn } from "@/app/_ui/color";
import { IconChat, IconCode, IconGlobe, IconKey, IconSend } from "@/app/_ui/icons";
import { Badge, Callout, Card, CardHeader, PageHeader } from "@/app/_ui/primitives";
import { requireOrgDb } from "@/lib/auth/requireOrgDb";
import { getDb } from "@/lib/db/client";
import type { Organization } from "@/lib/db/types";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Widget settings" };

export default async function SettingsPage() {
  const { orgDb, orgId } = await requireOrgDb();
  const apiKey = await orgDb.findOne("apiKeys");
  if (!apiKey) redirect("/dashboard");

  // organizations is the tenant root, looked up directly (same pattern as
  // the widget page and /api/chat).
  const db = await getDb();
  const org = await db.collection<Organization>("organizations").findOne({ _id: orgId });
  const origin = (process.env.APP_URL ?? "https://your-app.vercel.app").replace(/\/$/, "");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Widget"
        title="Widget settings"
        description="Put the assistant on your website and control where it's allowed to run."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader
              icon={IconCode}
              title="Install on your website"
              description="Paste this just before the closing </body> tag."
            />
            <div className="space-y-4 p-5 sm:p-6">
              <CopySnippet origin={origin} />
              <Callout tone="info" icon={IconKey} title="Where's my site key?">
                It was shown once when this organization was created, and only a hash is stored. If
                it&apos;s lost, create a new organization to get a fresh key.
              </Callout>
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={IconGlobe}
              title="Allowed domains"
              description="The widget refuses to load anywhere else, even with a valid site key."
            />
            <div className="p-5 sm:p-6">
              <SettingsForm currentDomains={apiKey.allowedDomains} />
            </div>
          </Card>
        </div>

        <Card className="h-fit lg:col-span-2">
          <CardHeader icon={IconChat} title="Appearance" description="How visitors see the assistant." />
          <div className="p-5 sm:p-6">
            {org ? <WidgetPreview org={org} /> : <p className="text-sm text-slate-500">Organization not found.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function WidgetPreview({ org }: { org: Organization }) {
  const { primaryColor, greeting, position } = org.widgetConfig;
  const onBrand = readableOn(primaryColor);
  return (
    <div>
      <div className="rounded-2xl bg-[radial-gradient(circle_at_30%_20%,rgba(148,163,184,0.15),transparent_60%)] p-4">
        <div className="mx-auto max-w-[18rem] overflow-hidden rounded-2xl bg-white text-left shadow-2xl ring-1 ring-black/5">
          <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: primaryColor, color: onBrand }}>
            <span className="grid size-8 place-items-center rounded-full bg-black/10">
              <IconChat className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{org.name}</p>
              <p className="text-[11px] opacity-80">AI assistant · online</p>
            </div>
          </div>
          <div className="space-y-2 bg-slate-50 px-3 py-4 text-[13px]">
            <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-slate-700 shadow-sm ring-1 ring-slate-200">
              {greeting}
            </p>
            <p
              className="ml-auto max-w-[80%] rounded-2xl rounded-br-md px-3 py-2"
              style={{ background: primaryColor, color: onBrand }}
            >
              Do you ship internationally?
            </p>
          </div>
          <div className="flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-2.5">
            <span className="flex-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-400">Ask a question…</span>
            <span className="grid size-7 place-items-center rounded-full" style={{ background: primaryColor, color: onBrand }}>
              <IconSend className="size-3.5" strokeWidth={2.25} />
            </span>
          </div>
        </div>
      </div>

      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-400">Brand colour</dt>
          <dd className="flex items-center gap-2 font-mono text-slate-200">
            <span className="size-4 rounded-md ring-1 ring-white/20" style={{ background: primaryColor }} />
            {primaryColor}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-400">Position</dt>
          <dd>
            <Badge>{position === "bottom-left" ? "Bottom left" : "Bottom right"}</Badge>
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="shrink-0 text-slate-400">Greeting</dt>
          <dd className="text-right text-slate-200">{greeting}</dd>
        </div>
      </dl>
      <p className="mt-5 text-xs leading-relaxed text-slate-500">
        Appearance is set when the organization is created. Editing it from the dashboard is on the
        roadmap.
      </p>
    </div>
  );
}
