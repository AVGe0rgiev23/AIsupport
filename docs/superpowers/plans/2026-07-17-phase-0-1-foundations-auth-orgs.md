# SupportAI — Phase 0 + 1 Implementation Plan (Foundations, Auth, Orgs & Data Model)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the SupportAI repo with a working deploy pipeline (Vercel + Trigger.dev + Atlas), an LLM provider abstraction that answers through both free providers, magic-link auth, multi-org tenancy with hard isolation, and the full §4 data model with indexes.

**Architecture:** Single Next.js (App Router) app in `D:\Business\supportai` with Trigger.dev tasks in `src/trigger/`. All LLM calls go through `src/lib/ai/provider.ts` (Gemini primary, Groq fallback on 429). All tenant-owned data access goes through the `withOrg` data-access layer that stamps/filters `orgId` on every operation. Auth.js v5 (database sessions, Resend magic links) with a `memberships` collection so one user can belong to multiple orgs (required by the org switcher).

**Tech Stack:** Next.js (latest, App Router, TypeScript, Tailwind, `src/` dir) · MongoDB Atlas M0 (`mongodb` driver v6) · Vercel AI SDK v5 (`ai`, `@ai-sdk/google`, `@ai-sdk/groq`) · Trigger.dev v4 · Auth.js v5 (`next-auth@beta` + `@auth/mongodb-adapter`) · Resend (magic-link email) · Vitest + mongodb-memory-server for tests · Vercel hosting.

**Spec:** `D:\Business\ai-support-kb-build-plan.md` (Phases 0–1, §§2–5, 7–8). Phases 2–7 get their own plans later.

## Global Constraints

- **Budget: $0/month.** Free tiers only — no paid signups, no cards.
- **TypeScript everywhere**, strict mode (create-next-app default).
- Every tenant-owned document carries `orgId` (as `ObjectId`, indexed). Tenant-owned collections are only touched through `withOrg()` — never ad-hoc `db.collection(...)` in product code (auth/user/org bootstrap code is the documented exception).
- **No provider imports outside `src/lib/ai/`.** Product code never imports `@ai-sdk/google` or `@ai-sdk/groq` directly.
- Chat models: primary `gemini-2.5-flash` (Google), fallback `llama-3.3-70b-versatile` (Groq). Selected by `LLM_PROVIDER` env (`google` | `groq`), default `google`.
- Embeddings: `gemini-embedding-001` truncated to **768 dims** — locked project-wide; the Atlas Vector Search index (Phase 2) must be created with 768 dims. Revisit only at the Phase 2 decision point, before first ingestion.
- All secrets server-side only (Vercel + Trigger.dev env vars). Nothing sensitive ever ships in client bundles.
- Database name: `supportai` (one Atlas M0 cluster).
- Node 20+, npm. Windows dev machine — use `curl.exe` (not the PowerShell `curl` alias) in verify steps.
- Deviation from spec §4, documented here: spec's `users.orgId/role` is replaced by a `memberships` collection (`userId`, `orgId`, `role`) plus `users.activeOrgId`, because the spec also requires an org switcher (many-to-many). Roles: `owner` | `admin` | `agent`.

## User-input checkpoints (the human must do these; everything else is executable by an agent)

1. **Task 2:** paste real keys into `.env.local` (Atlas URI, Gemini, Groq, Resend, Trigger.dev dev key; generate `AUTH_SECRET`).
2. **Task 5:** `npx trigger.dev@latest login` (browser), create Trigger.dev project "supportai", paste the project ref.
3. **Task 6:** `npx vercel login` (browser), add env vars in the Vercel dashboard.
4. **Task 9:** click the magic link in your own inbox to verify sign-in. (Resend free tier without a verified domain only delivers to the Resend account owner's email — use that address.)

## File structure (end state of this plan)

```
D:\Business\supportai\
  .env.example                  # committed template
  .env.local                    # real keys, gitignored
  trigger.config.ts             # Trigger.dev v4 config
  vitest.config.ts
  docs/superpowers/plans/2026-07-17-phase-0-1-foundations-auth-orgs.md   # this plan, copied in
  scripts/ensure-indexes.ts     # run once against Atlas
  tests/                        # vitest specs (env, provider, indexes, withOrg, siteKeys, orgs)
  src/
    auth.ts                     # Auth.js v5 config (adapter + Resend provider)
    types/next-auth.d.ts        # session.user.id augmentation
    app/
      api/auth/[...nextauth]/route.ts
      api/health/route.ts       # Atlas read/write smoke
      api/ai-smoke/route.ts     # streams from either provider
      api/trigger-smoke/route.ts# fires hello-world task
      signin/page.tsx
      check-email/page.tsx
      onboarding/page.tsx
      onboarding/create-org-form.tsx
      dashboard/page.tsx
      actions/orgs.ts           # server actions: create org, switch org, add test ticket
    lib/
      env.ts                    # zod-validated env
      ai/provider.ts            # THE provider abstraction (§5)
      db/client.ts              # Mongo client singleton
      db/types.ts               # §4 collection interfaces
      db/indexes.ts             # ensureIndexes(db)
      db/withOrg.ts             # org-scoped data-access layer
      siteKeys.ts               # generate/hash/verify public site keys
      orgs.ts                   # slugify, createOrg
    trigger/
      hello-world.ts
```

---

# Phase 0 — Foundations

### Task 1: Scaffold repo + test runner

**Files:**
- Create: entire Next.js scaffold under `D:\Business\supportai\` (generated)
- Create: `vitest.config.ts`, `tests/smoke.test.ts`, `.env.example`
- Create: `docs/superpowers/plans/2026-07-17-phase-0-1-foundations-auth-orgs.md` (copy of this plan)
- Modify: `.gitignore`, `package.json` (test script)

**Interfaces:**
- Consumes: nothing.
- Produces: a runnable Next.js app with `npm run dev`, `npm test` (vitest, `@/*` alias resolves), git repo with initial commits. Every later task assumes cwd `D:\Business\supportai`.

- [ ] **Step 1: Scaffold the app**

Run from `D:\Business` (PowerShell):

```powershell
npx create-next-app@latest supportai --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
```

Expected: `Success! Created supportai` and a git repo with an initial commit (create-next-app inits git).

- [ ] **Step 2: Copy this plan into the repo**

```powershell
New-Item -ItemType Directory -Force D:\Business\supportai\docs\superpowers\plans
Copy-Item D:\Business\ai-support-kb-implementation-plan-phase-0-1.md D:\Business\supportai\docs\superpowers\plans\2026-07-17-phase-0-1-foundations-auth-orgs.md
```

- [ ] **Step 3: Install vitest**

Run from `D:\Business\supportai` (all later commands run from here):

```powershell
npm install -D vitest vite-tsconfig-paths
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    hookTimeout: 120_000, // mongodb-memory-server downloads a binary on first run
    testTimeout: 30_000,
  },
});
```

- [ ] **Step 5: Add the test script**

In `package.json` `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Write a sanity test** — `tests/smoke.test.ts`

```ts
import { describe, expect, it } from "vitest";

describe("test runner", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Run tests**

```powershell
npm test
```

Expected: `Test Files  1 passed`, `Tests  1 passed`.

- [ ] **Step 8: Create `.env.example`**

```
MONGODB_URI=
GOOGLE_GENERATIVE_AI_API_KEY=
GROQ_API_KEY=
LLM_PROVIDER=google
RESEND_API_KEY=
AUTH_SECRET=
TRIGGER_SECRET_KEY=
APP_URL=http://localhost:3000
```

- [ ] **Step 9: Un-ignore the example file**

create-next-app's `.gitignore` contains `.env*`, which would also ignore `.env.example`. Append this line to `.gitignore`:

```
!.env.example
```

- [ ] **Step 10: Verify dev server boots**

Start `npm run dev` (background), then:

```powershell
curl.exe -s http://localhost:3000 | Select-String "Next.js"
```

Expected: HTML output (the default landing page). Stop the dev server after.

- [ ] **Step 11: Commit**

```powershell
git add -A
git commit -m "chore: scaffold Next.js app with vitest and env template"
```

---

### Task 2: Env validation module + fill real keys

**Files:**
- Create: `src/lib/env.ts`
- Create: `tests/env.test.ts`
- Create: `.env.local` (user fills — never committed)

**Interfaces:**
- Consumes: nothing.
- Produces: `loadEnv(source?: NodeJS.ProcessEnv): Env` (throws naming every invalid/missing var) and `env(): Env` (cached accessor). `Env` has: `MONGODB_URI`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`, `LLM_PROVIDER: "google" | "groq"`, `RESEND_API_KEY`, `AUTH_SECRET`, `TRIGGER_SECRET_KEY`, `APP_URL`. Later tasks call `env().LLM_PROVIDER` etc.

- [ ] **Step 1: Install zod**

```powershell
npm install zod
```

- [ ] **Step 2: Write the failing test** — `tests/env.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { loadEnv } from "@/lib/env";

const valid = {
  MONGODB_URI: "mongodb+srv://user:pass@cluster.example.mongodb.net/supportai",
  GOOGLE_GENERATIVE_AI_API_KEY: "test-google-key",
  GROQ_API_KEY: "test-groq-key",
  RESEND_API_KEY: "re_test",
  AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  TRIGGER_SECRET_KEY: "tr_dev_test",
};

describe("loadEnv", () => {
  it("throws naming every missing variable", () => {
    expect(() => loadEnv({} as NodeJS.ProcessEnv)).toThrowError(/MONGODB_URI/);
    expect(() => loadEnv({} as NodeJS.ProcessEnv)).toThrowError(/AUTH_SECRET/);
  });

  it("applies defaults for LLM_PROVIDER and APP_URL", () => {
    const env = loadEnv(valid as NodeJS.ProcessEnv);
    expect(env.LLM_PROVIDER).toBe("google");
    expect(env.APP_URL).toBe("http://localhost:3000");
  });

  it("rejects an unknown LLM_PROVIDER", () => {
    expect(() =>
      loadEnv({ ...valid, LLM_PROVIDER: "openai" } as NodeJS.ProcessEnv),
    ).toThrowError(/LLM_PROVIDER/);
  });
});
```

- [ ] **Step 3: Run it — must fail**

```powershell
npx vitest run tests/env.test.ts
```

Expected: FAIL — cannot resolve `@/lib/env`.

- [ ] **Step 4: Implement** — `src/lib/env.ts`

```ts
import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, "required"),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1, "required"),
  GROQ_API_KEY: z.string().min(1, "required"),
  LLM_PROVIDER: z.enum(["google", "groq"]).default("google"),
  RESEND_API_KEY: z.string().min(1, "required"),
  AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  TRIGGER_SECRET_KEY: z.string().min(1, "required"),
  APP_URL: z.string().url().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    throw new Error(`Invalid environment: ${details}`);
  }
  return result.data;
}

export function env(): Env {
  cached ??= loadEnv();
  return cached;
}
```

- [ ] **Step 5: Run tests — must pass**

```powershell
npx vitest run tests/env.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: CHECKPOINT (user) — create `.env.local`**

Copy `.env.example` to `.env.local` and fill in real values:
- `MONGODB_URI` — Atlas dashboard → your M0 cluster → Connect → Drivers. Ensure your current IP (or 0.0.0.0/0 while building) is in the Atlas IP access list.
- `GOOGLE_GENERATIVE_AI_API_KEY` — aistudio.google.com → Get API key.
- `GROQ_API_KEY` — console.groq.com → API Keys.
- `RESEND_API_KEY` — resend.com → API Keys.
- `AUTH_SECRET` — run `npx auth secret --raw` and paste the output (or any random 32+ char string).
- `TRIGGER_SECRET_KEY` — Trigger.dev dashboard → project (created in Task 5) → API keys → **dev** key (`tr_dev_...`). If the project doesn't exist yet, leave blank until Task 5.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/env.ts tests/env.test.ts package.json package-lock.json
git commit -m "feat: zod-validated environment module"
```

---

### Task 3: MongoDB client + health route (proves Atlas read/write)

**Files:**
- Create: `src/lib/db/client.ts`
- Create: `src/app/api/health/route.ts`

**Interfaces:**
- Consumes: `MONGODB_URI` from process env.
- Produces: `getClientPromise(): Promise<MongoClient>` (used by the Auth.js adapter in Task 9) and `getDb(): Promise<Db>` (returns the `supportai` database; used everywhere).

- [ ] **Step 1: Install the driver**

```powershell
npm install mongodb
```

- [ ] **Step 2: Implement** — `src/lib/db/client.ts`

```ts
import { MongoClient, type Db } from "mongodb";

declare global {
  // Reuse one client across Next.js hot reloads / route invocations
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

export function getClientPromise(): Promise<MongoClient> {
  if (!globalThis._mongoClientPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set");
    globalThis._mongoClientPromise = new MongoClient(uri).connect();
  }
  return globalThis._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db("supportai");
}
```

- [ ] **Step 3: Implement** — `src/app/api/health/route.ts`

```ts
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    await db.collection("healthchecks").insertOne({ at: new Date() });
    const count = await db.collection("healthchecks").countDocuments();
    return Response.json({ ok: true, healthchecks: count });
  } catch (err) {
    return Response.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Verify against real Atlas**

Start `npm run dev` (background), then run twice:

```powershell
curl.exe -s http://localhost:3000/api/health
curl.exe -s http://localhost:3000/api/health
```

Expected: `{"ok":true,"healthchecks":1}` then `{"ok":true,"healthchecks":2}` (count increments = write + read both work). If `ok:false` with a timeout, fix the Atlas IP access list first.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/db/client.ts src/app/api/health/route.ts package.json package-lock.json
git commit -m "feat: mongo client singleton and Atlas health route"
```

---

### Task 4: AI provider abstraction + smoke route (both providers answer)

**Files:**
- Create: `src/lib/ai/provider.ts`
- Create: `src/app/api/ai-smoke/route.ts`
- Create: `tests/provider.test.ts`

**Interfaces:**
- Consumes: `env()` from Task 2.
- Produces (used by Phase 3 chat route and Phase 2 embedding tasks):
  - `type ProviderName = "google" | "groq"`
  - `chatModel(provider?: ProviderName): LanguageModel` — defaults to `env().LLM_PROVIDER`
  - `fallbackProvider(primary: ProviderName): ProviderName`
  - `embeddingModel()` — `gemini-embedding-001` (768-dim truncation applied at call sites in Phase 2)
  - `isRateLimitError(err: unknown): boolean` — true on HTTP 429/503 (checks `statusCode` and wrapped `lastError.statusCode`)
  - `withProviderFallback<T>(run: (model, provider) => Promise<T>): Promise<{ result: T; provider: ProviderName }>`

- [ ] **Step 1: Install the AI SDK**

```powershell
npm install ai@^5 @ai-sdk/google@^2 @ai-sdk/groq@^2
```

- [ ] **Step 2: Write the failing tests** — `tests/provider.test.ts`

```ts
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.MONGODB_URI = "mongodb://localhost:27017/test";
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-google";
  process.env.GROQ_API_KEY = "test-groq";
  process.env.RESEND_API_KEY = "re_test";
  process.env.AUTH_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.TRIGGER_SECRET_KEY = "tr_dev_test";
  process.env.LLM_PROVIDER = "google";
});

describe("chatModel", () => {
  it("returns the Gemini model by default", async () => {
    const { chatModel } = await import("@/lib/ai/provider");
    const model = chatModel() as unknown as { modelId: string };
    expect(model.modelId).toBe("gemini-2.5-flash");
  });

  it("returns the Groq model when asked", async () => {
    const { chatModel } = await import("@/lib/ai/provider");
    const model = chatModel("groq") as unknown as { modelId: string };
    expect(model.modelId).toBe("llama-3.3-70b-versatile");
  });
});

describe("withProviderFallback", () => {
  it("falls back to groq on a 429 from google", async () => {
    const { withProviderFallback } = await import("@/lib/ai/provider");
    const seen: string[] = [];
    const { result, provider } = await withProviderFallback(async (_m, name) => {
      seen.push(name);
      if (name === "google") {
        throw Object.assign(new Error("rate limited"), { statusCode: 429 });
      }
      return "ok";
    });
    expect(seen).toEqual(["google", "groq"]);
    expect(provider).toBe("groq");
    expect(result).toBe("ok");
  });

  it("rethrows non-rate-limit errors without falling back", async () => {
    const { withProviderFallback } = await import("@/lib/ai/provider");
    await expect(
      withProviderFallback(async () => {
        throw Object.assign(new Error("bad request"), { statusCode: 400 });
      }),
    ).rejects.toThrow("bad request");
  });
});
```

- [ ] **Step 3: Run it — must fail**

```powershell
npx vitest run tests/provider.test.ts
```

Expected: FAIL — cannot resolve `@/lib/ai/provider`.

- [ ] **Step 4: Implement** — `src/lib/ai/provider.ts`

```ts
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import type { EmbeddingModel, LanguageModel } from "ai";
import { env } from "@/lib/env";

export type ProviderName = "google" | "groq";

export const CHAT_MODELS: Record<ProviderName, string> = {
  google: "gemini-2.5-flash",
  groq: "llama-3.3-70b-versatile",
};

export function chatModel(
  provider: ProviderName = env().LLM_PROVIDER,
): LanguageModel {
  switch (provider) {
    case "groq":
      return groq(CHAT_MODELS.groq);
    default:
      return google(CHAT_MODELS.google);
  }
}

export function fallbackProvider(primary: ProviderName): ProviderName {
  return primary === "google" ? "groq" : "google";
}

// 768-dim truncation (outputDimensionality) is applied at embed call sites in
// Phase 2 — the dimension is locked project-wide by the Atlas vector index.
export function embeddingModel(): EmbeddingModel<string> {
  return google.textEmbedding("gemini-embedding-001");
}

export function isRateLimitError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const status =
    (err as { statusCode?: number }).statusCode ??
    (err as { lastError?: { statusCode?: number } }).lastError?.statusCode;
  return status === 429 || status === 503;
}

export async function withProviderFallback<T>(
  run: (model: LanguageModel, provider: ProviderName) => Promise<T>,
): Promise<{ result: T; provider: ProviderName }> {
  const primary = env().LLM_PROVIDER;
  try {
    return { result: await run(chatModel(primary), primary), provider: primary };
  } catch (err) {
    if (!isRateLimitError(err)) throw err;
    const secondary = fallbackProvider(primary);
    return {
      result: await run(chatModel(secondary), secondary),
      provider: secondary,
    };
  }
}
```

- [ ] **Step 5: Run tests — must pass**

```powershell
npx vitest run tests/provider.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 6: Implement the smoke route** — `src/app/api/ai-smoke/route.ts`

```ts
import { streamText } from "ai";
import { chatModel, type ProviderName } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const provider = (url.searchParams.get("provider") ?? undefined) as
    | ProviderName
    | undefined;
  const result = streamText({
    model: chatModel(provider),
    prompt: "Reply with exactly: SupportAI provider check OK",
  });
  return result.toTextStreamResponse();
}
```

- [ ] **Step 7: Verify BOTH providers answer (real API calls)**

Start `npm run dev` (background), then:

```powershell
curl.exe -sN "http://localhost:3000/api/ai-smoke?provider=google"
curl.exe -sN "http://localhost:3000/api/ai-smoke?provider=groq"
```

Expected: each prints text containing `SupportAI provider check OK`. This is the Phase 0 done-when criterion "both LLM providers answer through the abstraction".

- [ ] **Step 8: Commit**

```powershell
git add src/lib/ai/provider.ts src/app/api/ai-smoke/route.ts tests/provider.test.ts package.json package-lock.json
git commit -m "feat: AI provider abstraction with 429 fallback and smoke route"
```

---

### Task 5: Trigger.dev hello-world task fired from a route handler

**Files:**
- Create: `trigger.config.ts`
- Create: `src/trigger/hello-world.ts`
- Create: `src/app/api/trigger-smoke/route.ts`

**Interfaces:**
- Consumes: `TRIGGER_SECRET_KEY` in `.env.local`.
- Produces: the Trigger.dev wiring every Phase 2+ background task builds on (`dirs: ["./src/trigger"]`), and the `tasks.trigger` pattern route handlers use.

- [ ] **Step 1: Install the SDK**

```powershell
npm install @trigger.dev/sdk@^4
```

- [ ] **Step 2: CHECKPOINT (user) — Trigger.dev login + project**

In the session, type `! npx trigger.dev@latest login` (opens browser). Then in the Trigger.dev dashboard create a project named **supportai**, and provide:
1. The **project ref** (`proj_...`, Project settings page).
2. The **dev API key** (`tr_dev_...`) → put it in `.env.local` as `TRIGGER_SECRET_KEY` if not done in Task 2.

- [ ] **Step 3: Create `trigger.config.ts`** (replace the project ref with the real one from Step 2)

```ts
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_REPLACE_WITH_YOUR_REF",
  dirs: ["./src/trigger"],
  maxDuration: 300,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
    },
  },
});
```

- [ ] **Step 4: Create the task** — `src/trigger/hello-world.ts`

```ts
import { logger, task } from "@trigger.dev/sdk";

export const helloWorld = task({
  id: "hello-world",
  run: async (payload: { name: string }) => {
    logger.info("hello-world running", { payload });
    return { greeting: `Hello, ${payload.name}!` };
  },
});
```

- [ ] **Step 5: Create the trigger route** — `src/app/api/trigger-smoke/route.ts`

```ts
import { tasks } from "@trigger.dev/sdk";
import type { helloWorld } from "@/trigger/hello-world";

export const dynamic = "force-dynamic";

export async function GET() {
  const handle = await tasks.trigger<typeof helloWorld>("hello-world", {
    name: "SupportAI",
  });
  return Response.json({ runId: handle.id });
}
```

- [ ] **Step 6: Verify end-to-end in dev**

Run in two background terminals: `npm run dev` and `npx trigger.dev@latest dev`. Then:

```powershell
curl.exe -s http://localhost:3000/api/trigger-smoke
```

Expected: `{"runId":"run_..."}`, and the `trigger.dev dev` terminal logs the `hello-world` run completing with output `{"greeting":"Hello, SupportAI!"}`. This is the Phase 0 done-when criterion "a hello-world Trigger.dev task runs from a route handler".

- [ ] **Step 7: Commit**

```powershell
git add trigger.config.ts src/trigger/hello-world.ts src/app/api/trigger-smoke/route.ts package.json package-lock.json
git commit -m "feat: trigger.dev v4 wiring with hello-world task and smoke route"
```

---

### Task 6: Deploy — Vercel + Trigger.dev production

**Files:**
- Modify: none required (Vercel auto-detects Next.js). `.vercel/` dir appears (already gitignored by the CLI).

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: a production URL (`https://supportai-<hash>.vercel.app` or similar) — the Phase 0 done-when. Record the URL; Phase 1 Task 12 redeploys onto it.

- [ ] **Step 1: Verify the production build locally first**

```powershell
npm run build
```

Expected: `✓ Compiled successfully` with no type errors. Fix anything before deploying.

- [ ] **Step 2: CHECKPOINT (user) — Vercel login**

Type `! npx vercel login` in the session (browser auth).

- [ ] **Step 3: Link the project**

```powershell
npx vercel link --yes
```

Expected: creates/links a Vercel project named `supportai`.

- [ ] **Step 4: CHECKPOINT (user) — add production env vars**

In the Vercel dashboard → supportai → Settings → Environment Variables, add for **Production**:

| Name | Value |
|---|---|
| `MONGODB_URI` | same as `.env.local` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | same |
| `GROQ_API_KEY` | same |
| `LLM_PROVIDER` | `google` |
| `RESEND_API_KEY` | same |
| `AUTH_SECRET` | same |
| `TRIGGER_SECRET_KEY` | **prod** key `tr_prod_...` from Trigger.dev dashboard (NOT the dev key) |
| `APP_URL` | the production URL (fill after first deploy, then redeploy) |

- [ ] **Step 5: Deploy**

```powershell
npx vercel --prod
```

Expected: `Production: https://...` URL printed.

- [ ] **Step 6: Deploy Trigger.dev tasks to prod**

```powershell
npx trigger.dev@latest deploy
```

Expected: `Deployed version ...` with `hello-world` listed.

- [ ] **Step 7: Verify production**

```powershell
curl.exe -s https://YOUR-PROD-URL/api/health
curl.exe -sN "https://YOUR-PROD-URL/api/ai-smoke?provider=google"
curl.exe -s https://YOUR-PROD-URL/api/trigger-smoke
```

Expected: `{"ok":true,...}` / `SupportAI provider check OK` / `{"runId":"run_..."}` with the run visible as **completed** in the Trigger.dev dashboard (prod environment). **Phase 0 is now done.**

- [ ] **Step 8: Commit anything changed**

```powershell
git add -A
git commit -m "chore: production deploy wiring" --allow-empty
```

---

# Phase 1 — Auth, orgs & data model

### Task 7: Collection types + indexes (§4 data model)

**Files:**
- Create: `src/lib/db/types.ts`
- Create: `src/lib/db/indexes.ts`
- Create: `scripts/ensure-indexes.ts`
- Create: `tests/indexes.test.ts`
- Modify: `package.json` (script `db:indexes`)

**Interfaces:**
- Consumes: `getDb` pattern from Task 3 (script connects directly).
- Produces: interfaces `Organization`, `Membership`, `Source`, `KbDocument`, `Chunk`, `KbArticle`, `Conversation`, `Message`, `Ticket`, `ApiKey`, `LlmUsage` (exact shapes below — later tasks import these) and `ensureIndexes(db: Db): Promise<void>` (idempotent).
- Note: the Atlas **Vector Search** index on `chunks.embedding` (768 dims, cosine, filters `orgId`+`documentId`) is created in the Phase 2 plan via the Atlas UI — it cannot be created by the driver and isn't needed until ingestion.

- [ ] **Step 1: Install test/script deps**

```powershell
npm install -D mongodb-memory-server tsx dotenv
```

- [ ] **Step 2: Write the failing test** — `tests/indexes.test.ts`

```ts
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureIndexes } from "@/lib/db/indexes";

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  db = client.db("supportai-test");
  await ensureIndexes(db);
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("ensureIndexes", () => {
  it("creates a unique slug index on organizations", async () => {
    const idx = await db.collection("organizations").indexes();
    expect(idx.find((i) => i.name === "slug_1")?.unique).toBe(true);
  });

  it("creates a unique membership per user+org", async () => {
    const idx = await db.collection("memberships").indexes();
    expect(idx.find((i) => i.name === "userId_1_orgId_1")?.unique).toBe(true);
  });

  it("creates orgId scoping indexes on tenant collections", async () => {
    const chunks = await db.collection("chunks").indexes();
    expect(chunks.some((i) => i.name === "orgId_1_documentId_1")).toBe(true);
    const tickets = await db.collection("tickets").indexes();
    expect(tickets.some((i) => i.name === "orgId_1_status_1_createdAt_-1")).toBe(true);
  });

  it("creates a unique hashedKey index on apiKeys", async () => {
    const idx = await db.collection("apiKeys").indexes();
    expect(idx.find((i) => i.name === "hashedKey_1")?.unique).toBe(true);
  });

  it("creates a unique daily usage counter index", async () => {
    const idx = await db.collection("llmUsage").indexes();
    expect(idx.find((i) => i.name === "orgId_1_date_1_provider_1")?.unique).toBe(true);
  });

  it("is idempotent", async () => {
    await expect(ensureIndexes(db)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run it — must fail**

```powershell
npx vitest run tests/indexes.test.ts
```

Expected: FAIL — cannot resolve `@/lib/db/indexes`. (First run downloads a MongoDB binary — may take a couple of minutes.)

- [ ] **Step 4: Implement the types** — `src/lib/db/types.ts`

```ts
import type { ObjectId } from "mongodb";

export type Role = "owner" | "admin" | "agent";
export type ProviderName = "google" | "groq";

export interface Organization {
  _id: ObjectId;
  name: string;
  slug: string;
  widgetConfig: {
    primaryColor: string;
    greeting: string;
    position: "bottom-right" | "bottom-left";
  };
  emailConfig: {
    supportAddress: string | null;
    mode: "draft" | "auto-send";
  };
  aiConfig: {
    tone: string;
    escalationRules: string;
    provider: ProviderName | null; // null = use global LLM_PROVIDER
  };
  createdAt: Date;
}

export interface Membership {
  _id: ObjectId;
  userId: ObjectId; // Auth.js users._id
  orgId: ObjectId;
  role: Role;
  createdAt: Date;
}

export interface Source {
  _id: ObjectId;
  orgId: ObjectId;
  type: "file" | "url" | "crawl" | "ticket-import";
  name: string;
  status: "pending" | "processing" | "ready" | "error";
  lastSyncedAt: Date | null;
  crawlSchedule: string | null; // cron expression, crawl sources only
  createdAt: Date;
}

export interface KbDocument {
  _id: ObjectId;
  orgId: ObjectId;
  sourceId: ObjectId;
  title: string;
  rawText: string;
  meta: Record<string, unknown>; // url, filename, contentHash, ...
  createdAt: Date;
}

export interface Chunk {
  _id: ObjectId;
  orgId: ObjectId;
  documentId: ObjectId;
  text: string;
  embedding: number[]; // 768 dims — locked (see Global Constraints)
  heading: string | null;
  position: number;
}

export interface KbArticle {
  _id: ObjectId;
  orgId: ObjectId;
  title: string;
  body: string; // markdown
  tags: string[];
  status: "ai-draft" | "published" | "archived";
  generatedFrom: {
    conversationId?: ObjectId;
    documentIds?: ObjectId[];
  } | null;
  approvedBy: ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  _id: ObjectId;
  orgId: ObjectId;
  channel: "widget" | "email";
  visitor: { email: string | null; name: string | null; pageUrl: string | null };
  status: "open" | "resolved" | "escalated";
  resolution: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  _id: ObjectId;
  conversationId: ObjectId;
  role: "user" | "assistant" | "system";
  content: string;
  citations: { chunkId: ObjectId; documentId: ObjectId }[];
  usage: { provider: string; inputTokens: number; outputTokens: number } | null;
  createdAt: Date;
}

export interface Ticket {
  _id: ObjectId;
  orgId: ObjectId;
  conversationId: ObjectId | null;
  visitorEmail: string;
  question: string;
  status: "open" | "answered" | "closed";
  assignee: ObjectId | null;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKey {
  _id: ObjectId;
  orgId: ObjectId;
  hashedKey: string; // sha256 hex of the public site key
  label: string;
  allowedDomains: string[]; // hostnames; subdomains implicitly allowed
  createdAt: Date;
}

export interface LlmUsage {
  _id: ObjectId;
  orgId: ObjectId;
  date: string; // YYYY-MM-DD (UTC)
  provider: string;
  requests: number;
  tokens: number;
}
```

- [ ] **Step 5: Implement the indexes** — `src/lib/db/indexes.ts`

```ts
import type { Db } from "mongodb";

export async function ensureIndexes(db: Db): Promise<void> {
  await db.collection("organizations").createIndex({ slug: 1 }, { unique: true });
  await db.collection("memberships").createIndex({ userId: 1, orgId: 1 }, { unique: true });
  await db.collection("memberships").createIndex({ orgId: 1 });
  await db.collection("sources").createIndex({ orgId: 1, status: 1 });
  await db.collection("documents").createIndex({ orgId: 1, sourceId: 1 });
  await db.collection("chunks").createIndex({ orgId: 1, documentId: 1 });
  await db.collection("kbArticles").createIndex({ orgId: 1, status: 1 });
  await db.collection("conversations").createIndex({ orgId: 1, status: 1, updatedAt: -1 });
  await db.collection("messages").createIndex({ conversationId: 1, createdAt: 1 });
  await db.collection("tickets").createIndex({ orgId: 1, status: 1, createdAt: -1 });
  await db.collection("apiKeys").createIndex({ hashedKey: 1 }, { unique: true });
  await db.collection("apiKeys").createIndex({ orgId: 1 });
  await db.collection("llmUsage").createIndex({ orgId: 1, date: 1, provider: 1 }, { unique: true });
}
```

- [ ] **Step 6: Run tests — must pass**

```powershell
npx vitest run tests/indexes.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 7: Create the script** — `scripts/ensure-indexes.ts`

```ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { MongoClient } from "mongodb";
import { ensureIndexes } from "../src/lib/db/indexes";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  const client = await MongoClient.connect(uri);
  await ensureIndexes(client.db("supportai"));
  console.log("Indexes ensured.");
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Add to `package.json` scripts: `"db:indexes": "tsx scripts/ensure-indexes.ts"`.

- [ ] **Step 8: Run it against real Atlas**

```powershell
npm run db:indexes
```

Expected: `Indexes ensured.`

- [ ] **Step 9: Commit**

```powershell
git add src/lib/db/types.ts src/lib/db/indexes.ts scripts/ensure-indexes.ts tests/indexes.test.ts package.json package-lock.json
git commit -m "feat: full collection type model and tenant indexes"
```

---

### Task 8: `withOrg` data-access layer (hard tenant isolation)

**Files:**
- Create: `src/lib/db/withOrg.ts`
- Create: `tests/withOrg.test.ts`

**Interfaces:**
- Consumes: types from Task 7.
- Produces: `withOrg(db: Db, orgId: ObjectId): OrgDb` where `OrgDb` has `find`, `findOne`, `insertOne` (stamps `orgId`, rejects caller-supplied `orgId` at the type level), `updateOne`, `deleteMany`, `countDocuments` — every operation filter-merged with `{ orgId }`. Collection names accepted: `"sources" | "documents" | "chunks" | "kbArticles" | "conversations" | "tickets" | "apiKeys" | "llmUsage"`. This is the ONLY way product code touches tenant collections.

- [ ] **Step 1: Write the failing test** — `tests/withOrg.test.ts`

```ts
import { MongoClient, ObjectId, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withOrg } from "@/lib/db/withOrg";

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
const orgA = new ObjectId();
const orgB = new ObjectId();

function ticket(question: string) {
  const now = new Date();
  return {
    conversationId: null,
    visitorEmail: "v@example.com",
    question,
    status: "open" as const,
    assignee: null,
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  db = client.db("supportai-test");
  await withOrg(db, orgA).insertOne("tickets", ticket("A's question"));
  await withOrg(db, orgB).insertOne("tickets", ticket("B's question"));
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("withOrg isolation", () => {
  it("stamps orgId on insert", async () => {
    const raw = await db.collection("tickets").findOne({ question: "A's question" });
    expect(raw?.orgId?.equals(orgA)).toBe(true);
  });

  it("find only returns the org's own documents", async () => {
    const rows = await withOrg(db, orgA).find("tickets").toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].question).toBe("A's question");
  });

  it("countDocuments is org-scoped", async () => {
    expect(await withOrg(db, orgA).countDocuments("tickets")).toBe(1);
    expect(await withOrg(db, orgB).countDocuments("tickets")).toBe(1);
  });

  it("findOne cannot fetch another org's document even by _id", async () => {
    const bDoc = await db.collection("tickets").findOne({ question: "B's question" });
    const stolen = await withOrg(db, orgA).findOne("tickets", { _id: bDoc!._id });
    expect(stolen).toBeNull();
  });

  it("updateOne cannot modify another org's document", async () => {
    const bDoc = await db.collection("tickets").findOne({ question: "B's question" });
    const res = await withOrg(db, orgA).updateOne(
      "tickets",
      { _id: bDoc!._id },
      { $set: { status: "closed" } },
    );
    expect(res.matchedCount).toBe(0);
  });

  it("deleteMany cannot delete another org's documents", async () => {
    const res = await withOrg(db, orgA).deleteMany("tickets", { status: "open" });
    expect(res.deletedCount).toBe(1); // only A's
    expect(await db.collection("tickets").countDocuments()).toBe(1); // B's survives
    // restore A's ticket for any later assertions
    await withOrg(db, orgA).insertOne("tickets", ticket("A's question"));
  });
});
```

- [ ] **Step 2: Run it — must fail**

```powershell
npx vitest run tests/withOrg.test.ts
```

Expected: FAIL — cannot resolve `@/lib/db/withOrg`.

- [ ] **Step 3: Implement** — `src/lib/db/withOrg.ts`

```ts
import type {
  Db,
  Document,
  Filter,
  FindOptions,
  ObjectId,
  UpdateFilter,
} from "mongodb";
import type {
  ApiKey,
  Chunk,
  Conversation,
  KbArticle,
  KbDocument,
  LlmUsage,
  Source,
  Ticket,
} from "./types";

export type OrgScoped = {
  sources: Source;
  documents: KbDocument;
  chunks: Chunk;
  kbArticles: KbArticle;
  conversations: Conversation;
  tickets: Ticket;
  apiKeys: ApiKey;
  llmUsage: LlmUsage;
};

export type OrgScopedName = keyof OrgScoped;

export function withOrg(db: Db, orgId: ObjectId) {
  const scoped = (filter: Document = {}): Filter<Document> => ({
    ...filter,
    orgId,
  });

  return {
    orgId,

    find<K extends OrgScopedName>(
      name: K,
      filter: Filter<OrgScoped[K]> = {},
      options?: FindOptions,
    ) {
      return db
        .collection<OrgScoped[K]>(name)
        .find(scoped(filter as Document) as Filter<OrgScoped[K]>, options);
    },

    findOne<K extends OrgScopedName>(
      name: K,
      filter: Filter<OrgScoped[K]> = {},
    ) {
      return db
        .collection<OrgScoped[K]>(name)
        .findOne(scoped(filter as Document) as Filter<OrgScoped[K]>);
    },

    insertOne<K extends OrgScopedName>(
      name: K,
      doc: Omit<OrgScoped[K], "_id" | "orgId">,
    ) {
      return db
        .collection(name)
        .insertOne({ ...(doc as Document), orgId });
    },

    updateOne<K extends OrgScopedName>(
      name: K,
      filter: Filter<OrgScoped[K]>,
      update: UpdateFilter<OrgScoped[K]>,
    ) {
      return db
        .collection<OrgScoped[K]>(name)
        .updateOne(
          scoped(filter as Document) as Filter<OrgScoped[K]>,
          update,
        );
    },

    deleteMany<K extends OrgScopedName>(
      name: K,
      filter: Filter<OrgScoped[K]> = {},
    ) {
      return db
        .collection<OrgScoped[K]>(name)
        .deleteMany(scoped(filter as Document) as Filter<OrgScoped[K]>);
    },

    countDocuments<K extends OrgScopedName>(
      name: K,
      filter: Filter<OrgScoped[K]> = {},
    ) {
      return db
        .collection<OrgScoped[K]>(name)
        .countDocuments(scoped(filter as Document) as Filter<OrgScoped[K]>);
    },
  };
}

export type OrgDb = ReturnType<typeof withOrg>;
```

- [ ] **Step 4: Run tests — must pass**

```powershell
npx vitest run tests/withOrg.test.ts
```

Expected: PASS (6 tests). This is the query-level proof of the Phase 1 done-when ("two orgs cannot see each other's data").

- [ ] **Step 5: Commit**

```powershell
git add src/lib/db/withOrg.ts tests/withOrg.test.ts
git commit -m "feat: org-scoped data access layer with isolation tests"
```

---

### Task 9: Auth.js v5 — magic-link sign-in

**Files:**
- Create: `src/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/types/next-auth.d.ts`
- Create: `src/app/signin/page.tsx`
- Create: `src/app/check-email/page.tsx`

**Interfaces:**
- Consumes: `getClientPromise` (Task 3), `RESEND_API_KEY` + `AUTH_SECRET` env.
- Produces: `auth()` (session with `session.user.id: string` — the Auth.js users `_id` as hex), `signIn`, `signOut`, `handlers` — imported from `@/auth` by every protected page/action in Tasks 11–12. Auth.js stores its users in the same `supportai` db (`users` collection, `_id: ObjectId`); we add `activeOrgId` to those docs in Task 11.

- [ ] **Step 1: Install**

```powershell
npm install next-auth@beta @auth/mongodb-adapter
```

If npm reports a peer-dependency conflict, re-run with `--legacy-peer-deps`.

- [ ] **Step 2: Create `src/auth.ts`**

```ts
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { getClientPromise } from "@/lib/db/client";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: MongoDBAdapter(getClientPromise(), { databaseName: "supportai" }),
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      // Free tier without a verified domain: only delivers to the Resend
      // account owner's email. Verify a domain before onboarding others.
      from: "SupportAI <onboarding@resend.dev>",
    }),
  ],
  pages: {
    signIn: "/signin",
    verifyRequest: "/check-email",
  },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
```

- [ ] **Step 3: Create the route** — `src/app/api/auth/[...nextauth]/route.ts`

```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 4: Create the type augmentation** — `src/types/next-auth.d.ts`

```ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
```

- [ ] **Step 5: Create the sign-in page** — `src/app/signin/page.tsx`

```tsx
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-4 text-2xl font-semibold">Sign in to SupportAI</h1>
      <form
        action={async (formData) => {
          "use server";
          await signIn("resend", {
            email: formData.get("email"),
            redirectTo: "/dashboard",
          });
        }}
        className="flex flex-col gap-3"
      >
        <input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="rounded border border-gray-300 p-2"
        />
        <button
          type="submit"
          className="rounded bg-indigo-600 p-2 text-white"
        >
          Email me a sign-in link
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Create the confirmation page** — `src/app/check-email/page.tsx`

```tsx
export default function CheckEmailPage() {
  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-2 text-2xl font-semibold">Check your email</h1>
      <p className="text-gray-600">
        A sign-in link has been sent. It expires in 24 hours.
      </p>
    </main>
  );
}
```

- [ ] **Step 7: Build check**

```powershell
npm run build
```

Expected: compiles with no type errors.

- [ ] **Step 8: CHECKPOINT (user) — verify the magic-link flow**

With `npm run dev` running: open `http://localhost:3000/signin`, enter the **Resend account owner's email**, submit → lands on `/check-email`. Click the link in the inbox. Then verify the session:

```powershell
curl.exe -s http://localhost:3000/api/auth/session
```

Expected (from a browser where you clicked the link): JSON containing your email. Note: after login the browser redirects to `/dashboard`, which 404s until Task 12 — that's expected for now.

- [ ] **Step 9: Commit**

```powershell
git add src/auth.ts src/app/api/auth src/types/next-auth.d.ts src/app/signin src/app/check-email package.json package-lock.json
git commit -m "feat: Auth.js v5 magic-link sign-in with MongoDB adapter"
```

---

### Task 10: Public site keys with domain allowlist

**Files:**
- Create: `src/lib/siteKeys.ts`
- Create: `tests/siteKeys.test.ts`

**Interfaces:**
- Consumes: `ApiKey` type (Task 7).
- Produces (used by Task 11's `createOrg` and by the Phase 3 chat route):
  - `generateSiteKey(): string` — `pk_` + 24 random bytes base64url
  - `hashSiteKey(key: string): string` — sha256 hex
  - `createSiteKey(db: Db, orgId: ObjectId, label: string, allowedDomains: string[]): Promise<string>` — returns the **plain** key (only time it's visible)
  - `isOriginAllowed(origin: string, allowedDomains: string[]): boolean` — exact host or subdomain match
  - `verifySiteKey(db: Db, key: string, origin: string | null): Promise<ApiKey | null>`

- [ ] **Step 1: Write the failing test** — `tests/siteKeys.test.ts`

```ts
import { MongoClient, ObjectId, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createSiteKey,
  generateSiteKey,
  hashSiteKey,
  isOriginAllowed,
  verifySiteKey,
} from "@/lib/siteKeys";

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
const orgId = new ObjectId();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  db = client.db("supportai-test");
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("generateSiteKey / hashSiteKey", () => {
  it("generates unique pk_-prefixed keys", () => {
    const a = generateSiteKey();
    const b = generateSiteKey();
    expect(a).toMatch(/^pk_[A-Za-z0-9_-]{20,}$/);
    expect(a).not.toBe(b);
  });

  it("hashes deterministically", () => {
    expect(hashSiteKey("pk_abc")).toBe(hashSiteKey("pk_abc"));
    expect(hashSiteKey("pk_abc")).toHaveLength(64);
  });
});

describe("isOriginAllowed", () => {
  it("allows exact domain and subdomains", () => {
    expect(isOriginAllowed("https://acme.com", ["acme.com"])).toBe(true);
    expect(isOriginAllowed("https://help.acme.com", ["acme.com"])).toBe(true);
  });

  it("rejects other domains and suffix tricks", () => {
    expect(isOriginAllowed("https://evil.com", ["acme.com"])).toBe(false);
    expect(isOriginAllowed("https://notacme.com", ["acme.com"])).toBe(false);
  });

  it("rejects malformed origins", () => {
    expect(isOriginAllowed("not-a-url", ["acme.com"])).toBe(false);
  });
});

describe("createSiteKey / verifySiteKey", () => {
  it("round-trips: created key verifies from an allowed origin", async () => {
    const key = await createSiteKey(db, orgId, "Default", ["localhost", "acme.com"]);
    const rec = await verifySiteKey(db, key, "http://localhost:3000");
    expect(rec?.orgId.equals(orgId)).toBe(true);
    expect(rec?.label).toBe("Default");
  });

  it("stores only the hash, never the plain key", async () => {
    const key = await createSiteKey(db, orgId, "HashCheck", ["acme.com"]);
    const raw = await db.collection("apiKeys").findOne({ label: "HashCheck" });
    expect(raw?.hashedKey).toBe(hashSiteKey(key));
    expect(JSON.stringify(raw)).not.toContain(key);
  });

  it("rejects a disallowed origin, a null origin, and an unknown key", async () => {
    const key = await createSiteKey(db, orgId, "Strict", ["acme.com"]);
    expect(await verifySiteKey(db, key, "https://evil.com")).toBeNull();
    expect(await verifySiteKey(db, key, null)).toBeNull();
    expect(await verifySiteKey(db, "pk_unknown", "https://acme.com")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — must fail**

```powershell
npx vitest run tests/siteKeys.test.ts
```

Expected: FAIL — cannot resolve `@/lib/siteKeys`.

- [ ] **Step 3: Implement** — `src/lib/siteKeys.ts`

```ts
import { createHash, randomBytes } from "crypto";
import type { Db, ObjectId } from "mongodb";
import type { ApiKey } from "./db/types";

export function generateSiteKey(): string {
  return "pk_" + randomBytes(24).toString("base64url");
}

export function hashSiteKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function createSiteKey(
  db: Db,
  orgId: ObjectId,
  label: string,
  allowedDomains: string[],
): Promise<string> {
  const key = generateSiteKey();
  await db.collection<ApiKey>("apiKeys").insertOne({
    orgId,
    hashedKey: hashSiteKey(key),
    label,
    allowedDomains,
    createdAt: new Date(),
  } as ApiKey);
  return key;
}

export function isOriginAllowed(
  origin: string,
  allowedDomains: string[],
): boolean {
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  return allowedDomains.some((d) => host === d || host.endsWith("." + d));
}

export async function verifySiteKey(
  db: Db,
  key: string,
  origin: string | null,
): Promise<ApiKey | null> {
  const record = await db
    .collection<ApiKey>("apiKeys")
    .findOne({ hashedKey: hashSiteKey(key) });
  if (!record || origin === null) return null;
  return isOriginAllowed(origin, record.allowedDomains) ? record : null;
}
```

- [ ] **Step 4: Run tests — must pass**

```powershell
npx vitest run tests/siteKeys.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/siteKeys.ts tests/siteKeys.test.ts
git commit -m "feat: public site keys with sha256 storage and domain allowlist"
```

---

### Task 11: Org creation (org + owner membership + default site key)

**Files:**
- Create: `src/lib/orgs.ts`
- Create: `tests/orgs.test.ts`

**Interfaces:**
- Consumes: `createSiteKey`/`verifySiteKey` (Task 10), types (Task 7).
- Produces (used by Task 12's server actions):
  - `slugify(name: string): string`
  - `createOrg(db: Db, opts: { name: string; userId: ObjectId }): Promise<{ orgId: ObjectId; slug: string; siteKey: string }>` — inserts the org with §4 default configs, an `owner` membership, a default site key (allowlist `["localhost"]`), and sets `users.activeOrgId`.

- [ ] **Step 1: Write the failing test** — `tests/orgs.test.ts`

```ts
import { MongoClient, ObjectId, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOrg, slugify } from "@/lib/orgs";
import { verifySiteKey } from "@/lib/siteKeys";

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
const userId = new ObjectId();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  db = client.db("supportai-test");
  await db.collection("users").insertOne({
    _id: userId,
    email: "owner@example.com",
    emailVerified: new Date(),
  });
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("slugify", () => {
  it("lowercases and dashes", () => {
    expect(slugify("Acme Corp!")).toBe("acme-corp");
  });
  it("never returns empty", () => {
    expect(slugify("!!!")).toBe("org");
  });
});

describe("createOrg", () => {
  it("creates org, owner membership, working site key, and sets activeOrgId", async () => {
    const { orgId, slug, siteKey } = await createOrg(db, {
      name: "Acme Corp",
      userId,
    });

    expect(slug).toBe("acme-corp");

    const org = await db.collection("organizations").findOne({ _id: orgId });
    expect(org?.name).toBe("Acme Corp");
    expect(org?.widgetConfig.position).toBe("bottom-right");
    expect(org?.emailConfig.mode).toBe("draft");

    const membership = await db.collection("memberships").findOne({ userId, orgId });
    expect(membership?.role).toBe("owner");

    const keyRec = await verifySiteKey(db, siteKey, "http://localhost:3000");
    expect(keyRec?.orgId.equals(orgId)).toBe(true);

    const user = await db.collection("users").findOne({ _id: userId });
    expect(user?.activeOrgId?.equals(orgId)).toBe(true);
  });

  it("dedupes slugs with a numeric suffix", async () => {
    const second = await createOrg(db, { name: "Acme Corp", userId });
    expect(second.slug).toBe("acme-corp-2");
  });
});
```

- [ ] **Step 2: Run it — must fail**

```powershell
npx vitest run tests/orgs.test.ts
```

Expected: FAIL — cannot resolve `@/lib/orgs`.

- [ ] **Step 3: Implement** — `src/lib/orgs.ts`

```ts
import { ObjectId, type Db } from "mongodb";
import { createSiteKey } from "./siteKeys";

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "org";
}

async function uniqueSlug(db: Db, base: string): Promise<string> {
  let slug = base;
  for (let n = 2; await db.collection("organizations").findOne({ slug }); n++) {
    slug = `${base}-${n}`;
  }
  return slug;
}

export interface CreateOrgResult {
  orgId: ObjectId;
  slug: string;
  siteKey: string;
}

export async function createOrg(
  db: Db,
  opts: { name: string; userId: ObjectId },
): Promise<CreateOrgResult> {
  const slug = await uniqueSlug(db, slugify(opts.name));
  const now = new Date();

  const { insertedId: orgId } = await db.collection("organizations").insertOne({
    name: opts.name,
    slug,
    widgetConfig: {
      primaryColor: "#4f46e5",
      greeting: "Hi! How can we help?",
      position: "bottom-right",
    },
    emailConfig: { supportAddress: null, mode: "draft" },
    aiConfig: { tone: "friendly and concise", escalationRules: "", provider: null },
    createdAt: now,
  });

  await db.collection("memberships").insertOne({
    userId: opts.userId,
    orgId,
    role: "owner",
    createdAt: now,
  });

  const siteKey = await createSiteKey(db, orgId, "Default site key", ["localhost"]);

  await db
    .collection("users")
    .updateOne({ _id: opts.userId }, { $set: { activeOrgId: orgId } });

  return { orgId, slug, siteKey };
}
```

- [ ] **Step 4: Run tests — must pass**

```powershell
npx vitest run tests/orgs.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/orgs.ts tests/orgs.test.ts
git commit -m "feat: org creation with owner membership and default site key"
```

---

### Task 12: Onboarding, dashboard, org switcher — and the isolation proof

**Files:**
- Create: `src/app/actions/orgs.ts`
- Create: `src/app/onboarding/page.tsx`
- Create: `src/app/onboarding/create-org-form.tsx`
- Create: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `auth`/`signOut` (Task 9), `createOrg` (Task 11), `withOrg` (Task 8), types (Task 7), `getDb` (Task 3).
- Produces: server actions `createOrgAction(prev: CreateOrgState, formData: FormData): Promise<CreateOrgState>` (`CreateOrgState = { siteKey?: string; orgName?: string; error?: string }`), `setActiveOrgAction(formData: FormData)` (membership-checked), `addTestTicketAction()`. The dashboard is the template Phase 4's inbox will grow inside.

- [ ] **Step 1: Create the server actions** — `src/app/actions/orgs.ts`

```ts
"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/lib/db/client";
import { withOrg } from "@/lib/db/withOrg";
import { createOrg } from "@/lib/orgs";

async function requireUserId(): Promise<ObjectId> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return new ObjectId(session.user.id);
}

export type CreateOrgState = {
  siteKey?: string;
  orgName?: string;
  error?: string;
};

export async function createOrgAction(
  _prev: CreateOrgState,
  formData: FormData,
): Promise<CreateOrgState> {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Organization name is required" };
  const db = await getDb();
  const { siteKey } = await createOrg(db, { name, userId });
  return { siteKey, orgName: name };
}

export async function setActiveOrgAction(formData: FormData) {
  const userId = await requireUserId();
  const orgId = new ObjectId(String(formData.get("orgId")));
  const db = await getDb();
  const member = await db.collection("memberships").findOne({ userId, orgId });
  if (!member) throw new Error("Not a member of that organization");
  await db
    .collection("users")
    .updateOne({ _id: userId }, { $set: { activeOrgId: orgId } });
  revalidatePath("/dashboard");
}

export async function addTestTicketAction() {
  const userId = await requireUserId();
  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: userId });
  const activeOrgId = user?.activeOrgId as ObjectId | undefined;
  if (!activeOrgId) throw new Error("No active organization");
  const member = await db
    .collection("memberships")
    .findOne({ userId, orgId: activeOrgId });
  if (!member) throw new Error("Not a member of that organization");

  const now = new Date();
  await withOrg(db, activeOrgId).insertOne("tickets", {
    conversationId: null,
    visitorEmail: "visitor@example.com",
    question: `Test ticket created at ${now.toISOString()}`,
    status: "open",
    assignee: null,
    notes: "",
    createdAt: now,
    updatedAt: now,
  });
  revalidatePath("/dashboard");
}
```

- [ ] **Step 2: Create the onboarding form (client)** — `src/app/onboarding/create-org-form.tsx`

```tsx
"use client";

import { useActionState } from "react";
import {
  createOrgAction,
  type CreateOrgState,
} from "@/app/actions/orgs";

export function CreateOrgForm() {
  const [state, formAction, pending] = useActionState<CreateOrgState, FormData>(
    createOrgAction,
    {},
  );

  if (state.siteKey) {
    return (
      <div className="rounded border border-gray-300 p-4">
        <h2 className="font-semibold">{state.orgName} created</h2>
        <p className="mt-2 text-sm text-gray-600">
          Your public site key — copy it now, it is shown only once:
        </p>
        <code className="mt-2 block break-all rounded bg-gray-100 p-2 text-sm">
          {state.siteKey}
        </code>
        <a
          href="/dashboard"
          className="mt-4 inline-block rounded bg-indigo-600 px-3 py-2 text-white"
        >
          Go to dashboard
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input
        name="name"
        required
        placeholder="Organization name"
        className="rounded border border-gray-300 p-2"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        disabled={pending}
        className="rounded bg-indigo-600 p-2 text-white disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create organization"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Create the onboarding page** — `src/app/onboarding/page.tsx`

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateOrgForm } from "./create-org-form";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-4 text-2xl font-semibold">Create an organization</h1>
      <CreateOrgForm />
    </main>
  );
}
```

- [ ] **Step 4: Create the dashboard** — `src/app/dashboard/page.tsx`

```tsx
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
```

- [ ] **Step 5: Build check**

```powershell
npm run build
```

Expected: compiles with no type errors.

- [ ] **Step 6: Run the FULL test suite**

```powershell
npm test
```

Expected: all test files pass (smoke, env, provider, indexes, withOrg, siteKeys, orgs).

- [ ] **Step 7: CHECKPOINT (user) — the two-org isolation walkthrough (Phase 1 done-when)**

With `npm run dev` running, in the browser:
1. Sign in at `/signin` (magic link).
2. Create **"Acme Test"** on `/onboarding` → site key shown once → dashboard.
3. Click **Add test ticket** → "Tickets in this organization: 1".
4. **+ Create another organization** → create **"Beta Test"** → dashboard (Beta is now active).
5. Beta shows **"Tickets in this organization: 0"** ← Acme's ticket is invisible. Add a Beta ticket → 1.
6. Switch back to Acme via the org switcher → still exactly 1 ticket (Acme's own).

Cross-org invisibility in the UI + the Task 8 query-level tests = **Phase 1 done**.

- [ ] **Step 8: Redeploy production**

```powershell
npx vercel --prod
npx trigger.dev@latest deploy
```

Expected: new production URL live; repeat sign-in + org creation once on prod to confirm auth works there (Vercel sets `AUTH_TRUST_HOST` automatically).

- [ ] **Step 9: Commit**

```powershell
git add src/app/actions src/app/onboarding src/app/dashboard
git commit -m "feat: onboarding, dashboard, and org switcher with isolation demo"
```

---

## Done-when mapping (spec → plan)

| Spec criterion | Where proven |
|---|---|
| Hello-world deploys on Vercel | Task 6 Step 7 |
| Hello-world Trigger.dev task runs from a route handler | Task 5 Step 6, Task 6 Step 7 |
| App reads/writes Atlas | Task 3 Step 4 |
| Both LLM providers answer through the abstraction | Task 4 Step 7 |
| Auth.js magic-link sign-in works | Task 9 Step 8 |
| Org creation, membership + roles, org switcher | Tasks 11–12 |
| All §4 collections with `orgId` indexes | Task 7 |
| Public site key per org with domain allowlist | Task 10 |
| Two test orgs cannot see each other's data anywhere | Task 8 tests + Task 12 Step 7 |

## Explicitly deferred to the Phase 2 plan

- Atlas Vector Search index on `chunks.embedding` (768 dims — locked here, created there).
- Vercel Blob file uploads, document parsing/chunking/embedding, crawling.
- The embedding-provider decision point (Gemini vs local transformers.js) — revisit before first large ingestion.
