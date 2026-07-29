import { headers } from "next/headers";
import { getDb } from "@/lib/db/client";
import { verifySiteKey } from "@/lib/siteKeys";
import { mintWidgetToken } from "@/lib/widgetToken";
import type { Organization } from "@/lib/db/types";
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
    <div style={{ padding: 16, fontFamily: "sans-serif", fontSize: 14, color: "#6b7280" }}>
      {reason}
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
      primaryColor={result.org.widgetConfig.primaryColor}
      greeting={result.org.widgetConfig.greeting}
      position={result.org.widgetConfig.position}
    />
  );
}

type AuthorizeResult =
  | { ok: true; org: Organization; widgetToken: string }
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
    return { ok: true, org, widgetToken };
  } catch (err) {
    console.error("widget page failed to authorize", { siteKey, origin, err });
    return { ok: false, reason: "This widget is temporarily unavailable" };
  }
}
