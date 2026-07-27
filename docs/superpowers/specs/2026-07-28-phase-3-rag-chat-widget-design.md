# SupportAI — Phase 3 Design (RAG Chat API + Widget)

**Date:** 2026-07-28
**Status:** Approved, ready for task-by-task planning
**Builds on:** Phase 0/1 (auth/orgs) and Phase 2 (ingestion pipeline), both complete and deployed. Original scope: `docs/superpowers/plans/2026-07-17-overall-build-plan.md` §6 Phase 3.

## Goal

Pasting a two-line embed snippet on any test site gives a working, branded, streaming chatbot that answers from that org's KB with citations, escalates to a human when it can't answer, and degrades politely (never a raw error to the visitor) when quota runs out.

## What already exists (verified against code, not assumed)

Audited directly before this design was written (`src/lib/db/types.ts`, `src/lib/db/vectorSearch.ts`, `src/lib/ai/provider.ts`, `src/lib/siteKeys.ts`, `src/trigger/*`, `src/app/**`):

- `searchChunks(db, orgId, queryVector, k=8)` — already takes `k`, already tenant-isolated via a `$vectorSearch` pre-filter, already excludes the embedding vector from results. Usable as-is.
- `embedQuery`/`embedTexts`, `chatModel()`, `isRateLimitError()` — usable as-is.
- `verifySiteKey`/`isOriginAllowed` (`src/lib/siteKeys.ts`) — usable as-is, with one known gap (below).
- `withProviderFallback` — real code, but **zero call sites anywhere** and only wraps a single resolved promise. Cannot handle a 429 that surfaces after `streamText()` has already returned a stream — Phase 3 needs a different mechanism (§3).
- Trigger.dev needs **no new tasks**. Chat lives entirely in Next.js route handlers, per the original architecture split (anything the visitor is waiting on stays on Vercel).
- `Conversation`, `Message`, `Ticket`, `LlmUsage` types are declared but have **zero data-access code anywhere** in the repo — Phase 3 writes this from scratch, it doesn't just wire up something latent.

## 1. Data model change

**Add `orgId: ObjectId` to `Message`.** Today `Message` has no `orgId` and is explicitly excluded from `withOrg`'s `OrgScopedName` union (it's keyed only by `conversationId`). Without `orgId`, every message query would need to first load the parent `Conversation` and check its `orgId` by hand — exactly the ad-hoc-query pattern `withOrg` exists to prevent (per the project's own security checklist). Zero rows exist in `Message` today, so this is a free schema change, not a migration.

No other schema changes. `Conversation`, `Ticket`, `ApiKey`, `LlmUsage` are used exactly as declared.

## 2. Request flow

`POST /api/chat` — public, site-key-authenticated (no session):

> **Superseded in part by §5.** The `{siteKey, widgetOrigin}` body and the in-route `verifySiteKey` call described in steps 1–2 were replaced by the signed-widget-token design once the origin-spoofing issue was found. §5 is authoritative for auth; steps 3–8 below are unchanged.

1. Body: `{widgetToken, conversationId | null, message}`.
2. `verifyWidgetToken(widgetToken)` — validates the HMAC signature and expiry, yielding the `orgId` and `verifiedOrigin` that `/widget` already checked against `allowedDomains` server-side at page-load time.
3. Load or create the `Conversation` (by `conversationId`, or new if null); insert the user `Message`. This happens **before** the rate check so a `conversationId` always exists for a `Ticket` to attach to, even when the cap blocks the call below.
4. Rate check: sum today's `llmUsage.requests` for the org **across both providers combined** (one shared daily pool — see §4). If ≥ `WIDGET_DAILY_MSG_CAP` (default 200), skip straight to the escalation marker (§4) — never attempt a call over budget.
5. `embedQuery(message)` → `searchChunks(db, orgId, vector, k=8)`.
6. Build: system prompt + numbered chunks `[1]…[k]` (source metadata) + last 10 `Message` rows (by `createdAt`) + new message.
7. `streamWithFallback(...)` (§3) with the `escalate_to_human` tool defined; stream back via `toUIMessageStreamResponse()`.
8. On finish: parse `[n]` markers into `citations`, persist the assistant `Message` (with `orgId`, `usage.provider`), increment `llmUsage` for whichever provider actually served the reply.

## 3. `streamWithFallback`

Verified directly against the installed `ai@5.0.216` source (not assumed from general AI-SDK knowledge, since the exact mechanism matters here):

- A provider failure (e.g. a 429) does **not** throw from `fullStream`'s iterator — the SDK catches it internally and enqueues a normal `{type: 'error', error}` **part**. `onError` is a logging side-channel only; it does not suppress the part.
- The very first part off `fullStream` is always `{type: 'start'}`, enqueued synchronously before the model call even runs.
- Every access to `.fullStream` / `.toUIMessageStreamResponse()` forks the underlying stream via `ReadableStream.tee()` (`teeStream()` internally) — a stream that has been partially peeked still replays those same parts to a later consumer. **No manual buffering or "splicing a chunk back on" is needed** — that part of the original design was based on a wrong assumption about how the SDK works.
- `streamText`'s `maxRetries` defaults to 2; set `maxRetries: 0` on the primary call so a 429 surfaces as the first error part immediately, rather than after the SDK's own retry/backoff delay.

Resulting algorithm:
```
result = streamText({ model: primary, maxRetries: 0, tools: { escalate_to_human }, ... })
for-await part of result.fullStream:
  if part.type === 'start': continue          // always first, ignore
  if part.type === 'error' && isRateLimitError(part.error):
    discard result
    result = streamText({ model: fallback, ... })   // fresh call, no maxRetries:0 needed here
    return result.toUIMessageStreamResponse()
  else:
    break   // any other part (text-delta, tool-call, ...) means the primary call is genuinely streaming
return result.toUIMessageStreamResponse()      // same `result` — tee()'s replay includes the peeked parts
```
This only ever falls back before anything has reached the visitor. It's pure enough to unit test with a fake `LanguageModel`/fake stream, following the existing dependency-injection pattern in `tests/embeddings.test.ts` (build a fake model object, don't `vi.mock("ai")`).

If the fallback call **also** fails on its first meaningful part (both providers 429), that is one of the three escalation triggers (§4) — the route catches this and returns the escalation marker instead of a broken stream.

## 4. Rate limiting + escalation (one mechanism, three triggers)

A `LeadCapture` UI in the widget (email + optional note) is the single visitor-facing surface for all three cases:

1. The model calls `escalate_to_human` mid-stream.
2. Both providers fail on their first meaningful stream part (quota exhausted).
3. The org's combined daily `llmUsage` cap is hit before the call starts.

**State machine** (this needed deciding — `Ticket.visitorEmail` is a required field, so a ticket cannot exist before the visitor supplies one): none of the three triggers creates a `Ticket` directly. Each just tells the widget to show `LeadCapture`:
- Tool-call case: a marker in the stream the widget watches for.
- Dual-429 / cap-hit cases: no streaming is attempted at all — the route returns a direct JSON response with the escalation marker and a reason.

A single new endpoint, `POST /api/chat/escalate`, is the one code path that fires when the visitor submits `LeadCapture`: it creates the `Ticket` (`visitorEmail`, `note`, `conversationId`, `reason`) and sets `conversation.status = "escalated"` together, atomically from the visitor's perspective.

**Cap semantics:** `WIDGET_DAILY_MSG_CAP` (env var, default 200) applies to the **sum** of `llmUsage.requests` across both providers for the org/day — one shared pool, not a separate budget per provider. (A per-provider cap would silently double an org's effective daily limit by falling back to the other provider's separate pool, which defeats the point of the cap: stopping one noisy tenant from burning the whole shared free-tier quota.)

## 5. Widget delivery

- Embed snippet: `<script src=".../widget.js" data-site-key="pk_...">` — renamed from the original outline's `data-org`, since the attribute's value is the org's public site key, not a separate identifier (nothing else is needed to resolve the org/config: `verifySiteKey` already returns the `ApiKey` record's `orgId`).
- `public/widget.js` (plain JS, reads `data-site-key` via `document.currentScript`) creates an iframe pointed at `/widget?siteKey=<value>` on the app's own domain. **No client-supplied `host`/origin query param.**
- **Security correction (caught applying the security skill's "never trust the client" rule):** the original outline had the widget page trust a `host` query param — built by the embedding page's own JS and passed through the iframe URL — as the value checked against `allowedDomains`. That's spoofable by anyone holding the site key (necessarily public; it ships in plaintext in the customer's HTML): they can load `/widget?siteKey=...` directly, or in their own iframe, with any `host` value, bypassing the domain allowlist entirely. Fixed: the `/widget` page (a Server Component) reads the real, browser-enforced `Origin`/`Referer` header on its own GET request via Next's `headers()` — this is what a cross-origin iframe embed actually sends and cannot be forged by the embedding page's JavaScript. It calls the **existing** `verifySiteKey(db, siteKey, realOrigin)` at page-load time (no new auth logic). If that fails, the page renders a "this widget isn't authorized for this domain" state instead of a chat UI. If it succeeds, the server mints a short-lived HMAC-signed token (`mintWidgetToken` — payload `{orgId, verifiedOrigin, exp}`, new `WIDGET_TOKEN_SECRET` env var) and passes it to the client as a rendered prop (not a URL param). The client's `POST /api/chat` sends `{widgetToken, conversationId, message}` — no separate `siteKey`/`widgetOrigin` fields, since both are embedded in the signed token; the route verifies the signature (timing-safe comparison) and expiry, then trusts the embedded `orgId`/`verifiedOrigin` — values the client cannot alter without invalidating the signature. This still means **no CORS handling is needed** for `/api/chat` (the POST is same-origin by construction), while the domain check now enforces what it claims to.
- Widget page is a Server Component (`src/app/widget/page.tsx`) rendering a client chat component, themed from `Organization.widgetConfig` (`primaryColor`/`greeting`/`position` — confirmed these exist and are set at org creation).
- New dependency: `@ai-sdk/react` pinned **exactly** `2.0.218` (not `^`) — confirmed this is the release whose nested `ai` dependency is exactly `5.0.216`, matching the top-level `ai` version already installed and avoiding a duplicate/divergent `ai` module instance in `node_modules`.
- `useChat` + `DefaultChatTransport`'s `prepareSendMessagesRequest` option — confirmed this fully **replaces** (not merges) the outgoing request body, so the widget can POST exactly `{widgetToken, conversationId, message}` instead of the SDK's default `{id, messages[], trigger, messageId}` shape, while still getting `useChat`'s SSE parsing and reconnect handling. No custom `ChatTransport` implementation needed.
- `allowedDomains` currently has no creation/edit path (only `["localhost"]`, set once at org creation, no normalization). Add a minimal server action to edit it, lowercase-normalizing on write (fixes the confirmed case-sensitivity gap) — otherwise this phase's own done-when criterion can't be verified on a real domain.
- `/api/chat/route.ts` and `/api/chat/escalate/route.ts` need no `runtime` export (defaults to `nodejs`, confirmed compatible with the MongoDB driver, matching the existing `ai-smoke` route). Next.js 16 has no breaking changes affecting this.
- Reject messages over a fixed length (4000 chars) at the `/api/chat` boundary before any DB/LLM work — cheap input validation, distinct from the per-visitor throttling explicitly deferred to Phase 7.

## 6. Testing approach

Matches Phase 2's established pattern (no new precedent needed): unit tests for pure logic — `streamWithFallback` (fake stream/model), `[n]`-citation-marker parsing, the rate-cap aggregation query — using dependency-injected fakes, not `vi.mock("ai")`. The widget UI itself (chat rendering, `LeadCapture` form) is verified via a manual browser walkthrough checkpoint, same as Phase 2's Task 12. No `vitest.config.ts` changes (it currently only matches `.test.ts`, not `.test.tsx` — no component-test infrastructure is being added this phase).

## 7. Deferred out of Phase 3 (matches original phase boundaries)

- Summarizing conversation history beyond the last 10 turns.
- Admin inbox UI and Resend email notification on new tickets (Phase 4 — Phase 3 only creates the `Ticket` row).
- Per-org configurable caps (global env var for now).

## Key decisions log

| # | Decision | Chosen | Why |
|---|---|---|---|
| 1 | Message tenant isolation | Add `orgId` to `Message` | Avoids ad-hoc joins through `Conversation` at every call site; zero migration cost |
| 2 | `allowedDomains` editing | Add minimal server action this phase | Otherwise the phase's done-when is unverifiable on a real domain |
| 3 | Daily cap scope | Combined across providers | Per-provider caps would double effective quota, defeating the cap's purpose |
| 4 | Widget UI test scope | Manual browser checkpoint (no component tests) | Matches every prior phase's precedent; no test infra exists for `.tsx` yet |
| 5 | `streamWithFallback` mechanism | Peek `fullStream` parts, no manual splice | Verified against installed AI SDK source: errors are stream parts, not thrown exceptions, and `tee()`-based replay makes manual buffering unnecessary |
| 6 | Widget origin verification | Server-verified Origin/Referer + signed token, not a client-supplied query param | Security review: a client-constructed `host` param is spoofable by anyone with the (necessarily public) site key, defeating the domain allowlist entirely |
