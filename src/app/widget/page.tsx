import { headers } from "next/headers";
import { getDb } from "@/lib/db/client";
import { verifySiteKey } from "@/lib/siteKeys";
import { mintWidgetToken } from "@/lib/widgetToken";
import type { Organization } from "@/lib/db/types";
import { IconLock } from "@/app/_ui/icons";
import { ChatWidget } from "./chat-widget";

function realOrigin(hdrs: Headers): string | null {
  const origin = hdrs.get("origin");
  if (origin) return origin;
  const referer = hdrs.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function UnauthorizedWidget({ reason }: { reason: string }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-white px-8 text-center font-sans">
      <span className="grid size-11 place-items-center rounded-full bg-slate-100 text-slate-400">
        <IconLock className="size-5" />
      </span>
      <p className="mt-4 text-sm font-medium text-slate-700">Chat is unavailable here</p>
      <p className="mt-1 text-[13px] text-slate-500">{reason}</p>
    </div>
  );
}

export default async function WidgetPage({
  searchParams,
}: {
  searchParams: Promise<{ siteKey?: string }>;
}) {
  const { siteKey } = await searchParams;
  const hdrs = await headers();
  const origin = realOrigin(hdrs);

  if (!siteKey || !origin) {
    return <UnauthorizedWidget reason="Missing site key or unverifiable origin" />;
  }

  const result = await authorize(siteKey, origin);
  if (!result.ok) {
    return <UnauthorizedWidget reason={result.reason} />;
  }

  return (
    <ChatWidget
      widgetToken={result.widgetToken}
      orgName={result.orgName}
      primaryColor={result.primaryColor}
      greeting={result.greeting}
      position={result.position}
    />
  );
}

type AuthorizeResult =
  | {
      ok: true;
      widgetToken: string;
      orgName: string;
      primaryColor: string;
      greeting: string;
      position: "bottom-right" | "bottom-left";
    }
  | { ok: false; reason: string };

// Kept as plain data-in/data-out (no JSX) and called before any JSX is
// constructed: React's eslint rules flag constructing JSX inside a
// try/catch, since a render error thrown by a component further down the
// tree wouldn't be caught here anyway — only a real error boundary catches
// that. That's not what this guard is for. All the DB/network work below
// (getDb()'s Mongo connection, the apiKeys lookup inside verifySiteKey, the
// organizations lookup) can throw on a transient blip, and letting THAT
// throw reach Next's default error boundary would render Next's generic
// error page INSIDE a customer's iframe on their production site — the
// same "never a raw error reaches the visitor" constraint /api/chat and
// /api/chat/escalate already enforce. Fail closed to the same neutral
// unauthorized state instead, and log server-side only (never leak error
// details into the rendered output).
async function authorize(siteKey: string, origin: string): Promise<AuthorizeResult> {
  try {
    const db = await getDb();
    const record = await verifySiteKey(db, siteKey, origin);
    if (!record) {
      return { ok: false, reason: "This widget isn't authorized for this domain" };
    }

    // organizations is the tenant root, not a tenant-owned document, so it is
    // deliberately looked up directly rather than through withOrg (matches
    // src/app/api/chat/route.ts's existing pattern). Typed via
    // db.collection<Organization>(...) so widgetConfig.position below is a
    // real "bottom-right" | "bottom-left" union, not `any` silently
    // satisfying ChatWidget's prop type regardless of what's actually stored.
    const org = await db.collection<Organization>("organizations").findOne({ _id: record.orgId });
    if (!org) {
      return { ok: false, reason: "Organization not found" };
    }

    const widgetToken = mintWidgetToken(record.orgId, origin);
    // widgetConfig is declared required on Organization, but TypeScript can't
    // verify that against what's actually stored — a document written or
    // migrated without it would make this a runtime TypeError. Dereferencing
    // it here, inside the try, means that throw is caught below and folded
    // into the same neutral "temporarily unavailable" state as every other
    // failure in this function, instead of escaping to WidgetPage's return
    // and crashing render with Next's generic error UI inside the customer's
    // iframe — the exact failure mode this whole function exists to prevent.
    return {
      ok: true,
      widgetToken,
      orgName: org.name,
      primaryColor: org.widgetConfig.primaryColor,
      greeting: org.widgetConfig.greeting,
      position: org.widgetConfig.position,
    };
  } catch (err) {
    console.error("widget page failed to authorize", { siteKey, origin, err });
    return { ok: false, reason: "This widget is temporarily unavailable" };
  }
}
