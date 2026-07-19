# SupportAI — Phase 2 Implementation Plan (Ingestion Pipeline — KB in)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An org can upload a PDF/DOCX/MD/TXT, point at a help-center URL, or import a ticket CSV/mbox — and end up with searchable, org-isolated, 768-dim embedded chunks in Atlas, watching ingestion progress live in the dashboard.

**Architecture:** Pure ingestion libraries (`src/lib/ingest/*` — chunking, extraction, crawling, ticket parsing) are TDD'd in isolation and consumed by three thin Trigger.dev tasks (`ingest-document`, `crawl-website`, `import-tickets`) that share one `concurrencyLimit: 1` queue to respect free-tier rate limits. Embeddings go through `src/lib/ai/embeddings.ts` (batched, paced, 429-retried, L2-normalized — the only place `outputDimensionality: 768` lives). Files land in Vercel Blob via server actions that then `tasks.trigger` by id with `org:`/`source:` tags; the sources dashboard subscribes to those tags with Trigger.dev Realtime. Atlas Vector Search (`$vectorSearch` with an `orgId` pre-filter) is the retrieval primitive Phase 3 will build chat on.

**Tech Stack (additions):** `@vercel/blob` (file storage) · `unpdf` (PDF text) · `mammoth` (DOCX text) · `cheerio` (already conceptually specced; HTML/sitemap parsing) · `papaparse` (CSV) · `@trigger.dev/react-hooks` (Realtime UI) · `pdf-lib` (dev-only, test fixtures). Everything else is the Phase 0/1 stack.

**Spec:** `D:\Business\ai-support-kb-build-plan.md` §6 "Phase 2", plus §4 (data model) and §5 (AI design). Phase 0/1 plan: `docs/superpowers/plans/2026-07-17-phase-0-1-foundations-auth-orgs.md`.

## Global Constraints

- **Budget: $0/month.** Free tiers only — no paid signups, no cards. Vercel Blob Hobby: 1 GB storage / 10 GB transfer per month; the project pauses (no overage billing) at the cap.
- **TypeScript everywhere**, strict mode. Node 20+, npm. Windows dev machine — use `curl.exe` (not the PowerShell `curl` alias) in verify steps.
- Every tenant-owned document carries `orgId` (as `ObjectId`, indexed). Tenant-owned collections are only touched through `withOrg()` — never ad-hoc `db.collection(...)` in product code. **One new documented exception:** the `scheduled-recrawl` task's cross-org *read* of due crawl sources (Task 8); all its writes still go through `withOrg`.
- **No provider imports outside `src/lib/ai/`.** Tasks and routes consume `embedTexts` / `extractPdfWithGemini`, never `@ai-sdk/google` directly.
- **Embeddings: `gemini-embedding-001` truncated to 768 dims, cosine similarity — LOCKED by this plan** (decision rationale below). The Atlas Vector Search index is created with these values at Task 5's checkpoint. Corpus chunks use `taskType: "RETRIEVAL_DOCUMENT"`, queries use `"RETRIEVAL_QUERY"`.
- **All LLM/embedding-calling tasks share the `ingestion` queue with `concurrencyLimit: 1`** — free-tier RPM discipline. Batches pace themselves (`pauseMs` between embed batches); overnight-slow is acceptable, 429 storms are not.
- Trigger.dev task ids introduced here: `ingest-document`, `crawl-website`, `import-tickets`, `scheduled-recrawl`. Tags per triggered run: `org:<orgId>`, `source:<sourceId>` (well under the 10-tag max).
- Import from `@trigger.dev/sdk` — never `@trigger.dev/sdk/v3`. Trigger tasks from backend code with **type-only** imports + `tasks.trigger<typeof t>("id", payload, opts)`.
- Blob uploads use `access: "public"` (unguessable URLs — the free, token-less-read path). Server-action uploads are capped at **4.5 MB** (Vercel request-body limit); larger files are deferred (client uploads, later phase).
- Database name `supportai`; vector index name `chunks_vector_index` (M0 allows 3 search indexes; this is our first).

## The embedding decision (spec §6 Phase 2 decision point) — RESOLVED: stay on Gemini 768

**Recommendation: keep `gemini-embedding-001` @ 768 dims. Do not switch to local transformers.js (384).** Reasons, in order of weight:

1. **Query and corpus must share one embedding space.** Phase 3 embeds the user's question inside the Vercel chat route. A local MiniLM there means shipping a ~30 MB ONNX model inside a Hobby serverless function — cold-start and bundle pain that effectively forces the query embed back onto an API anyway. Mixed models (MiniLM corpus, Gemini queries) are semantically invalid.
2. **Pilot volume fits the free tier with room to spare.** A full re-ingest of a 200-page help center ≈ 1,000 chunk embeddings = **10 batched API requests** (100 texts/request). Even twenty full ingests a day ≈ 200 requests, comfortably inside the ~1,000 requests/day free embedding quota (~100 RPM); our queue concurrency of 1 plus batch pacing keeps RPM in the tens. **Verify the current numbers at https://ai.google.dev/gemini-api/docs/rate-limits during Task 4** — they shift; the architecture doesn't.
3. **Retrieval quality is the product.** 768-dim Gemini embeddings retrieve materially better than 384-dim MiniLM, and every chat answer is only as good as its top-k.
4. **The cost of being wrong is at its lifetime minimum right now.** Nothing is embedded yet. If the pilot ever sustains quota exhaustion (watch for 429 retries in Trigger.dev run logs), the swap is: reimplement `embedTexts` internals, drop/recreate one Atlas index at 384, re-run ingestion. `EMBEDDING_DIMS` is exported from exactly one file.

**Fallback trigger (write it down, don't relitigate):** two consecutive days where ingestion runs exhaust the daily embedding quota → either flip to paid Gemini embeddings (cheap, zero code) or execute the transformers.js swap above *together with* moving query-embedding server-side. Until then: locked.

## User-input checkpoints (the human must do these; everything else is executable by an agent)

1. **Task 5:** create the Atlas Vector Search index in the Atlas UI (M0 can't do it through the driver) — exact JSON given in the task.
2. **Task 10:** create the Vercel Blob store in the Vercel dashboard and paste `BLOB_READ_WRITE_TOKEN` into `.env.local`.
3. **Task 12:** add `MONGODB_URI` + `GOOGLE_GENERATIVE_AI_API_KEY` to the **Trigger.dev dashboard → prod environment variables** (dev reads `.env.local` automatically), then run the end-to-end walkthrough in the browser.

## File structure (end state of this plan)

```
D:\Business\supportai\
  scripts/
    verify-vector-search.ts       # live Atlas $vectorSearch + isolation proof
  tests/
    withOrgInsertMany.test.ts
    chunk.test.ts
    extract.test.ts
    embeddings.test.ts
    vectorSearch.test.ts
    crawl.test.ts
    recrawl.test.ts
    tickets.test.ts
  src/
    lib/
      db/types.ts                 # MODIFIED: Source gains config/lastRunId/errorMessage/chunkCount
      db/withOrg.ts               # MODIFIED: + insertMany
      db/vectorSearch.ts          # searchChunks + pure pipeline builder
      ai/embeddings.ts            # embedTexts/embedQuery — batching, pacing, 768, normalize
      ai/pdfExtract.ts            # Gemini native-PDF fallback for scanned docs
      ingest/chunk.ts             # heading-aware ~500–800-token chunker
      ingest/extract.ts           # pdf/docx/md/txt → text
      ingest/crawl.ts             # sitemap parse, main-content extraction, url helpers
      ingest/tickets.ts           # CSV + mbox → {title, body}[]
    trigger/
      queues.ts                   # shared `ingestion` queue (concurrencyLimit: 1)
      ingest-document.ts
      crawl-website.ts
      import-tickets.ts
      scheduled-recrawl.ts
    app/
      actions/sources.ts          # create/retry/delete source server actions
      dashboard/page.tsx          # MODIFIED: nav link to /dashboard/sources
      dashboard/sources/page.tsx  # server: list + mint realtime token
      dashboard/sources/sources-panel.tsx  # client: live list + three add-source forms
  docs/superpowers/plans/2026-07-19-phase-2-ingestion-pipeline.md   # this plan
```

---

# Phase 2 tasks

### Task 1: Data-layer extensions — `Source` config union + `withOrg.insertMany`

**Files:**
- Modify: `src/lib/db/types.ts` (the `Source` interface only)
- Modify: `src/lib/db/withOrg.ts` (add `insertMany`)
- Create: `tests/withOrgInsertMany.test.ts`

**Interfaces:**
- Consumes: existing `withOrg`, `OrgScoped` types.
- Produces: `Source` with `config: SourceConfig` (discriminated by `type`), `lastRunId: string | null`, `errorMessage: string | null`, `chunkCount: number`; `SourceConfig` union exported. `withOrg(db, orgId).insertMany(name, docs)` stamping `orgId` on every doc. Every later task consumes both.

- [ ] **Step 1: Replace the `Source` interface in `src/lib/db/types.ts`**

Replace the existing `Source` block (and add the config types directly above it):

```ts
export type SourceConfig =
  | { kind: "file"; blobUrl: string; filename: string; contentType: string }
  | { kind: "crawl"; rootUrl: string; maxPages: number; maxDepth: number }
  | { kind: "ticket-import"; blobUrl: string; filename: string; format: "csv" | "mbox" };

export interface Source {
  _id: ObjectId;
  orgId: ObjectId;
  type: "file" | "url" | "crawl" | "ticket-import";
  name: string;
  status: "pending" | "processing" | "ready" | "error";
  config: SourceConfig;
  lastRunId: string | null; // Trigger.dev run id of the latest ingestion run
  errorMessage: string | null;
  chunkCount: number;
  lastSyncedAt: Date | null;
  crawlSchedule: "daily" | "weekly" | null; // crawl sources only
  createdAt: Date;
}
```

(`type: "url"` stays in the union for spec §4 compatibility but Phase 2 creates only `file` / `crawl` / `ticket-import` sources — a single URL is a crawl with `maxPages: 1`.)

- [ ] **Step 2: Write the failing test** — `tests/withOrgInsertMany.test.ts`

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
const docId = new ObjectId();

function chunk(position: number) {
  return {
    documentId: docId,
    text: `chunk ${position}`,
    embedding: [0.1, 0.2],
    heading: null,
    position,
  };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  db = client.db("supportai-test");
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("withOrg.insertMany", () => {
  it("stamps orgId on every inserted doc", async () => {
    const res = await withOrg(db, orgA).insertMany("chunks", [chunk(0), chunk(1), chunk(2)]);
    expect(res.insertedCount).toBe(3);
    const rows = await db.collection("chunks").find({}).toArray();
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.orgId.equals(orgA)).toBe(true);
  });

  it("inserted docs are invisible to another org", async () => {
    expect(await withOrg(db, orgB).countDocuments("chunks")).toBe(0);
    expect(await withOrg(db, orgA).countDocuments("chunks")).toBe(3);
  });
});
```

- [ ] **Step 3: Run it — must fail**

```powershell
npx vitest run tests/withOrgInsertMany.test.ts
```

Expected: FAIL — `insertMany` is not a function.

- [ ] **Step 4: Implement** — add to the returned object in `src/lib/db/withOrg.ts`, directly after `insertOne`:

```ts
    insertMany<K extends OrgScopedName>(
      name: K,
      docs: Omit<OrgScoped[K], "_id" | "orgId">[],
    ) {
      return db
        .collection(name)
        .insertMany(docs.map((doc) => ({ ...(doc as Document), orgId })));
    },
```

- [ ] **Step 5: Run the FULL suite — all green (type change must not break Phase 1)**

```powershell
npm test
```

Expected: all previous files + the new one pass. (No Phase 1 code writes `sources`, so the `Source` change is compile-only.)

- [ ] **Step 6: Commit**

```powershell
git add src/lib/db/types.ts src/lib/db/withOrg.ts tests/withOrgInsertMany.test.ts
git commit -m "feat: source config model and org-stamped insertMany"
```

---

### Task 2: Heading-aware chunker

**Files:**
- Create: `src/lib/ingest/chunk.ts`
- Create: `tests/chunk.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `chunkText(text: string, opts?: { maxChars?: number; minChars?: number }): TextChunk[]` with `TextChunk = { text: string; heading: string | null; position: number }`. Defaults `maxChars = 2800`, `minChars = 200` (≈ 700 / 50 tokens at the standard ~4 chars/token approximation — inside the spec's 500–800-token target without a tokenizer dependency). Tasks 6, 7, 9 consume this.

- [ ] **Step 1: Write the failing test** — `tests/chunk.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { chunkText } from "@/lib/ingest/chunk";

const doc = [
  "# Refunds",
  "",
  "You can request a refund within 30 days. " + "Details. ".repeat(40),
  "",
  "## Partial refunds",
  "",
  "Partial refunds apply to downgrades. " + "More. ".repeat(40),
  "",
  "# Shipping",
  "",
  "We ship worldwide. " + "Info. ".repeat(40),
].join("\n");

describe("chunkText", () => {
  it("returns empty for blank input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("attributes each chunk to its nearest preceding heading", () => {
    const chunks = chunkText(doc);
    const byHeading = new Map(chunks.map((c) => [c.heading, c]));
    expect(byHeading.has("Refunds")).toBe(true);
    expect(byHeading.has("Partial refunds")).toBe(true);
    expect(byHeading.has("Shipping")).toBe(true);
  });

  it("numbers positions sequentially from 0", () => {
    const chunks = chunkText(doc);
    expect(chunks.map((c) => c.position)).toEqual(chunks.map((_, i) => i));
  });

  it("never exceeds maxChars, hard-splitting oversized paragraphs", () => {
    const oneGiantParagraph = "word ".repeat(2000); // 10,000 chars, no breaks
    const chunks = chunkText(oneGiantParagraph, { maxChars: 1000 });
    expect(chunks.length).toBeGreaterThan(9);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(1000);
  });

  it("merges tiny trailing sections instead of emitting sub-minChars fragments", () => {
    const tiny = "# A\n\nshort.\n\n# B\n\nalso short.";
    const chunks = chunkText(tiny, { maxChars: 2800, minChars: 200 });
    expect(chunks).toHaveLength(1); // both sections packed into one chunk
  });

  it("keeps heading text out of none-heading plain text", () => {
    const chunks = chunkText("No headings here.\n\nJust text.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].heading).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — must fail**

```powershell
npx vitest run tests/chunk.test.ts
```

Expected: FAIL — cannot resolve `@/lib/ingest/chunk`.

- [ ] **Step 3: Implement** — `src/lib/ingest/chunk.ts`

```ts
export interface TextChunk {
  text: string;
  heading: string | null;
  position: number;
}

const HEADING_RE = /^#{1,6}\s+(.+)$/;

interface Block {
  text: string;
  heading: string | null;
}

/** Split into paragraph blocks, each tagged with its nearest preceding heading. */
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let heading: string | null = null;
  for (const rawPara of text.split(/\n{2,}/)) {
    const para = rawPara.trim();
    if (!para) continue;
    const lines = para.split("\n");
    const buf: string[] = [];
    for (const line of lines) {
      const m = HEADING_RE.exec(line.trim());
      if (m) {
        if (buf.length) blocks.push({ text: buf.join("\n"), heading });
        buf.length = 0;
        heading = m[1].trim();
      } else {
        buf.push(line);
      }
    }
    if (buf.length) blocks.push({ text: buf.join("\n").trim(), heading });
  }
  return blocks.filter((b) => b.text.length > 0);
}

function hardSplit(text: string, maxChars: number): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    // prefer breaking at the last space inside the window
    const window = rest.slice(0, maxChars);
    const cut = window.lastIndexOf(" ") > maxChars * 0.5 ? window.lastIndexOf(" ") : maxChars;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export function chunkText(
  text: string,
  opts: { maxChars?: number; minChars?: number } = {},
): TextChunk[] {
  const maxChars = opts.maxChars ?? 2800;
  const minChars = opts.minChars ?? 200;

  const chunks: TextChunk[] = [];
  let bufText = "";
  let bufHeading: string | null = null;

  const flush = () => {
    if (bufText.trim()) {
      chunks.push({ text: bufText.trim(), heading: bufHeading, position: chunks.length });
    }
    bufText = "";
  };

  for (const block of toBlocks(text)) {
    for (const piece of hardSplit(block.text, maxChars)) {
      const candidate = bufText ? `${bufText}\n\n${piece}` : piece;
      if (bufText && candidate.length > maxChars) {
        flush();
        bufText = piece;
        bufHeading = block.heading;
      } else {
        if (!bufText) bufHeading = block.heading;
        bufText = candidate;
      }
      // A comfortably-sized chunk whose next block starts a new heading reads
      // better closed out here than merged across topics.
      if (bufText.length >= minChars && block.heading !== bufHeading) {
        flush();
        bufHeading = block.heading;
      }
    }
  }
  flush();
  return chunks;
}
```

- [ ] **Step 4: Run it — must pass**

```powershell
npx vitest run tests/chunk.test.ts
```

Expected: PASS (all 6). If the heading-boundary test fails, debug the buffer/heading handoff — do not weaken the assertions.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/ingest/chunk.ts tests/chunk.test.ts
git commit -m "feat: heading-aware text chunker for ingestion"
```

---

### Task 3: File text extraction (PDF / DOCX / MD / TXT)

**Files:**
- Create: `src/lib/ingest/extract.ts`
- Create: `tests/extract.test.ts`
- Modify: `package.json` (deps)

**Interfaces:**
- Consumes: nothing from earlier tasks (pure).
- Produces: `extractFileText(input: { data: Uint8Array; contentType: string; filename: string }): Promise<ExtractedFile>` with `ExtractedFile = { text: string; title: string | null; pageCount: number | null }`; `looksScanned(extracted: ExtractedFile): boolean`; `UnsupportedFileTypeError`. Task 6 consumes all three.

- [ ] **Step 1: Install dependencies**

```powershell
npm install unpdf mammoth
npm install --save-dev pdf-lib
```

(`unpdf` = serverless-friendly PDF.js wrapper, no native deps; `mammoth` = DOCX raw text; `pdf-lib` generates test-fixture PDFs so no binaries are committed.)

- [ ] **Step 2: Write the failing test** — `tests/extract.test.ts`

```ts
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  extractFileText,
  looksScanned,
  UnsupportedFileTypeError,
} from "@/lib/ingest/extract";

async function makePdf(text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 50, y: 700, size: 12, font });
  return pdf.save();
}

describe("extractFileText", () => {
  it("extracts text from a PDF", async () => {
    const data = await makePdf("Refunds are available within 30 days.");
    const out = await extractFileText({
      data,
      contentType: "application/pdf",
      filename: "policy.pdf",
    });
    expect(out.text).toContain("Refunds are available within 30 days.");
    expect(out.pageCount).toBe(1);
  });

  it("passes markdown/plain text through and takes the first heading as title", async () => {
    const md = "# Getting started\n\nWelcome to the product.";
    const out = await extractFileText({
      data: new TextEncoder().encode(md),
      contentType: "text/markdown",
      filename: "guide.md",
    });
    expect(out.text).toBe(md);
    expect(out.title).toBe("Getting started");
  });

  it("falls back to the filename (sans extension) when there is no heading", async () => {
    const out = await extractFileText({
      data: new TextEncoder().encode("plain content"),
      contentType: "text/plain",
      filename: "faq-2026.txt",
    });
    expect(out.title).toBe("faq-2026");
  });

  it("throws UnsupportedFileTypeError for unknown types", async () => {
    await expect(
      extractFileText({
        data: new Uint8Array([1, 2, 3]),
        contentType: "image/png",
        filename: "photo.png",
      }),
    ).rejects.toBeInstanceOf(UnsupportedFileTypeError);
  });
});

describe("looksScanned", () => {
  it("flags a multi-page PDF with almost no text", () => {
    expect(looksScanned({ text: "a b", title: null, pageCount: 5 })).toBe(true);
  });
  it("does not flag a normal text-bearing document", () => {
    expect(
      looksScanned({ text: "word ".repeat(300), title: null, pageCount: 2 }),
    ).toBe(false);
  });
  it("never flags non-PDFs (pageCount null)", () => {
    expect(looksScanned({ text: "", title: null, pageCount: null })).toBe(false);
  });
});
```

- [ ] **Step 3: Run it — must fail**

```powershell
npx vitest run tests/extract.test.ts
```

Expected: FAIL — cannot resolve `@/lib/ingest/extract`.

- [ ] **Step 4: Implement** — `src/lib/ingest/extract.ts`

```ts
import mammoth from "mammoth";
import { extractText as unpdfExtractText, getDocumentProxy } from "unpdf";

export interface ExtractedFile {
  text: string;
  title: string | null;
  pageCount: number | null; // PDFs only; null for other types
}

export class UnsupportedFileTypeError extends Error {
  constructor(contentType: string, filename: string) {
    super(`Unsupported file type ${contentType} (${filename})`);
    this.name = "UnsupportedFileTypeError";
  }
}

/** Fewer than ~50 extractable chars per page usually means a scanned/image PDF. */
export const SCANNED_MIN_CHARS_PER_PAGE = 50;

export function looksScanned(extracted: ExtractedFile): boolean {
  if (extracted.pageCount === null || extracted.pageCount === 0) return false;
  return extracted.text.length / extracted.pageCount < SCANNED_MIN_CHARS_PER_PAGE;
}

function titleFrom(text: string, filename: string): string | null {
  const headingMatch = /^#{1,6}\s+(.+)$/m.exec(text);
  if (headingMatch) return headingMatch[1].trim();
  const base = filename.replace(/\.[^.]+$/, "").trim();
  return base || null;
}

export async function extractFileText(input: {
  data: Uint8Array;
  contentType: string;
  filename: string;
}): Promise<ExtractedFile> {
  const { data, contentType, filename } = input;
  const lower = filename.toLowerCase();

  if (contentType === "application/pdf" || lower.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(data);
    const { totalPages, text } = await unpdfExtractText(pdf, { mergePages: true });
    return { text: text.trim(), title: titleFrom(text, filename), pageCount: totalPages };
  }

  if (
    contentType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data) });
    return { text: value.trim(), title: titleFrom(value, filename), pageCount: null };
  }

  if (
    contentType.startsWith("text/") ||
    lower.endsWith(".md") ||
    lower.endsWith(".txt")
  ) {
    const text = new TextDecoder("utf-8").decode(data).trim();
    return { text, title: titleFrom(text, filename), pageCount: null };
  }

  throw new UnsupportedFileTypeError(contentType, filename);
}
```

- [ ] **Step 5: Run it — must pass**

```powershell
npx vitest run tests/extract.test.ts
```

Expected: PASS (7 tests). Note: unpdf may join drawn words with spaces differently across versions — if the PDF assertion fails on whitespace, assert on `out.text.replace(/\s+/g, " ")` instead; do not drop the assertion.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/ingest/extract.ts tests/extract.test.ts package.json package-lock.json
git commit -m "feat: pdf/docx/md/txt text extraction with scanned-pdf detection"
```

---

### Task 4: Embeddings module — batched, paced, normalized, 429-retried

**Files:**
- Create: `src/lib/ai/embeddings.ts`
- Create: `tests/embeddings.test.ts`

**Interfaces:**
- Consumes: `embeddingModel()`, `isRateLimitError()` from `src/lib/ai/provider.ts` (Phase 0).
- Produces:
  - `EMBEDDING_DIMS = 768`, `EMBED_BATCH_SIZE = 100`.
  - `embedTexts(texts: string[], opts?: EmbedOpts): Promise<number[][]>` — corpus embedding (`taskType: "RETRIEVAL_DOCUMENT"`).
  - `embedQuery(text: string, opts?: EmbedOpts): Promise<number[]>` — query embedding (`taskType: "RETRIEVAL_QUERY"`; Phase 3's chat route consumes this).
  - `EmbedOpts = { model?: EmbeddingModel<string>; sleep?: (ms: number) => Promise<void>; batchSize?: number; pauseMs?: number }` — injection points exist for tests; production callers pass nothing.
- Behavior contract: batches of ≤ 100; `pauseMs` (default 700 ms) sleep **between** batches (not after the last); every vector L2-normalized (required after 768-truncation) and length-asserted; on a rate-limit error the batch waits 30 s and retries **once**, then rethrows.

- [ ] **Step 1: Write the failing test** — `tests/embeddings.test.ts`

The AI SDK's `embedMany` calls the model's `doEmbed`. We fake the model object at that surface.

```ts
import type { EmbeddingModel } from "ai";
import { describe, expect, it, vi } from "vitest";
import { embedQuery, embedTexts, EMBEDDING_DIMS } from "@/lib/ai/embeddings";

/** Fake EmbeddingModelV2 whose vectors are all-ones (so normalization is visible). */
function fakeModel(calls: string[][], failFirstWith?: unknown): EmbeddingModel<string> {
  let failed = false;
  return {
    specificationVersion: "v2",
    provider: "fake",
    modelId: "fake-embed",
    maxEmbeddingsPerCall: 100,
    supportsParallelCalls: false,
    doEmbed: async ({ values }: { values: string[] }) => {
      if (failFirstWith && !failed) {
        failed = true;
        throw failFirstWith;
      }
      calls.push([...values]);
      return {
        embeddings: values.map(() => new Array(EMBEDDING_DIMS).fill(1)),
      };
    },
  } as unknown as EmbeddingModel<string>;
}

const noSleep = async () => {};

describe("embedTexts", () => {
  it("splits into batches of batchSize and pauses between batches only", async () => {
    const calls: string[][] = [];
    const sleep = vi.fn(noSleep);
    const texts = Array.from({ length: 250 }, (_, i) => `t${i}`);
    const out = await embedTexts(texts, {
      model: fakeModel(calls),
      sleep,
      batchSize: 100,
      pauseMs: 700,
    });
    expect(out).toHaveLength(250);
    expect(calls.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(sleep).toHaveBeenCalledTimes(2); // between 3 batches, not after the last
    expect(sleep).toHaveBeenCalledWith(700);
  });

  it("L2-normalizes every vector", async () => {
    const calls: string[][] = [];
    const [vec] = await embedTexts(["hello"], { model: fakeModel(calls), sleep: noSleep });
    expect(vec).toHaveLength(EMBEDDING_DIMS);
    const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 6);
  });

  it("retries a rate-limited batch once after a 30s sleep", async () => {
    const calls: string[][] = [];
    const sleep = vi.fn(noSleep);
    const out = await embedTexts(["a", "b"], {
      model: fakeModel(calls, { statusCode: 429 }),
      sleep,
    });
    expect(out).toHaveLength(2);
    expect(sleep).toHaveBeenCalledWith(30_000);
  });

  it("rethrows non-rate-limit errors immediately", async () => {
    const calls: string[][] = [];
    await expect(
      embedTexts(["a"], { model: fakeModel(calls, new Error("boom")), sleep: noSleep }),
    ).rejects.toThrow("boom");
  });

  it("returns [] for no texts without calling the model", async () => {
    const calls: string[][] = [];
    expect(await embedTexts([], { model: fakeModel(calls), sleep: noSleep })).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("embedQuery", () => {
  it("returns a single normalized vector", async () => {
    const calls: string[][] = [];
    const vec = await embedQuery("what is the refund policy?", {
      model: fakeModel(calls),
      sleep: noSleep,
    });
    expect(vec).toHaveLength(EMBEDDING_DIMS);
    expect(calls).toEqual([["what is the refund policy?"]]);
  });
});
```

- [ ] **Step 2: Run it — must fail**

```powershell
npx vitest run tests/embeddings.test.ts
```

Expected: FAIL — cannot resolve `@/lib/ai/embeddings`.

- [ ] **Step 3: Implement** — `src/lib/ai/embeddings.ts`

```ts
import { embedMany, type EmbeddingModel } from "ai";
import { embeddingModel, isRateLimitError } from "@/lib/ai/provider";

export const EMBEDDING_DIMS = 768;
export const EMBED_BATCH_SIZE = 100;

export interface EmbedOpts {
  model?: EmbeddingModel<string>;
  sleep?: (ms: number) => Promise<void>;
  batchSize?: number;
  pauseMs?: number;
}

type GeminiTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function l2Normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
  if (norm === 0) return vec;
  return vec.map((x) => x / norm);
}

async function embedBatch(
  model: EmbeddingModel<string>,
  values: string[],
  taskType: GeminiTaskType,
  sleep: (ms: number) => Promise<void>,
): Promise<number[][]> {
  const call = () =>
    embedMany({
      model,
      values,
      providerOptions: {
        google: { outputDimensionality: EMBEDDING_DIMS, taskType },
      },
    });
  let result;
  try {
    result = await call();
  } catch (err) {
    if (!isRateLimitError(err)) throw err;
    await sleep(30_000); // free-tier RPM window; one retry, then surface
    result = await call();
  }
  return result.embeddings.map((vec) => {
    if (vec.length !== EMBEDDING_DIMS) {
      throw new Error(
        `Embedding has ${vec.length} dims, expected ${EMBEDDING_DIMS} — check outputDimensionality`,
      );
    }
    return l2Normalize(vec);
  });
}

async function embed(
  texts: string[],
  taskType: GeminiTaskType,
  opts: EmbedOpts,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const model = opts.model ?? embeddingModel();
  const sleep = opts.sleep ?? defaultSleep;
  const batchSize = opts.batchSize ?? EMBED_BATCH_SIZE;
  const pauseMs = opts.pauseMs ?? 700;

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    if (i > 0) await sleep(pauseMs); // pace between batches, never after the last
    const batch = texts.slice(i, i + batchSize);
    out.push(...(await embedBatch(model, batch, taskType, sleep)));
  }
  return out;
}

export function embedTexts(texts: string[], opts: EmbedOpts = {}): Promise<number[][]> {
  return embed(texts, "RETRIEVAL_DOCUMENT", opts);
}

export async function embedQuery(text: string, opts: EmbedOpts = {}): Promise<number[]> {
  const [vec] = await embed([text], "RETRIEVAL_QUERY", opts);
  return vec;
}
```

- [ ] **Step 4: Run it — must pass**

```powershell
npx vitest run tests/embeddings.test.ts
```

Expected: PASS (7 tests). If `embedMany` retries internally and masks the 429 test, pass `maxRetries: 0` inside the `embedMany` call and re-run — the module owns retry policy, not the SDK.

- [ ] **Step 5: Sanity-check the live API once (uses ~1 request of quota) and verify current free-tier limits**

```powershell
npx tsx -e "import { config } from 'dotenv'; config({ path: '.env.local' }); import('./src/lib/ai/embeddings').then(async (m) => { const v = await m.embedQuery('hello world'); console.log('dims', v.length, 'norm~1', Math.abs(1 - Math.sqrt(v.reduce((s: number, x: number) => s + x * x, 0))) < 1e-5); });"
```

Expected: `dims 768 norm~1 true`. While here, open https://ai.google.dev/gemini-api/docs/rate-limits and confirm the free-tier embedding limits still comfortably cover the volume math in "The embedding decision" above; note any change in the PR/commit message.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/ai/embeddings.ts tests/embeddings.test.ts
git commit -m "feat: batched, paced, normalized gemini embeddings module"
```

---

### Task 5: Atlas Vector Search — index (user checkpoint) + `searchChunks`

**Files:**
- Create: `src/lib/db/vectorSearch.ts`
- Create: `tests/vectorSearch.test.ts`
- Create: `scripts/verify-vector-search.ts`
- Modify: `package.json` (add `db:verify-vector` script)

**Interfaces:**
- Consumes: `Chunk` type (Task 1's file), `getDb` (Phase 0), `EMBEDDING_DIMS` (Task 4).
- Produces: `CHUNKS_VECTOR_INDEX = "chunks_vector_index"`; `vectorSearchPipeline(orgId: ObjectId, queryVector: number[], k: number): Document[]` (pure — the testable isolation guarantee); `searchChunks(db: Db, orgId: ObjectId, queryVector: number[], k = 8): Promise<ScoredChunk[]>` with `ScoredChunk = Pick<Chunk, "_id" | "documentId" | "text" | "heading" | "position"> & { score: number }`. Phase 3's chat route consumes `searchChunks`.

- [ ] **Step 1: CHECKPOINT (user) — create the Vector Search index in the Atlas UI**

M0 clusters cannot create search indexes through the driver — this is a UI step. In https://cloud.mongodb.com → your cluster → **Search & Vector Search** → **Create Search Index** → type **Vector Search** → **JSON Editor**:

- Database: `supportai`, Collection: `chunks`, Index name: `chunks_vector_index`
- Definition (exactly):

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
    { "type": "filter", "path": "orgId" },
    { "type": "filter", "path": "documentId" }
  ]
}
```

Wait until the index shows **Active** (usually < 2 minutes on an empty collection). This burns 1 of M0's 3 search indexes; §5's future `kbArticles` search is the second — we stay within budget.

- [ ] **Step 2: Write the failing unit test (pipeline shape = the isolation invariant)** — `tests/vectorSearch.test.ts`

```ts
import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import { CHUNKS_VECTOR_INDEX, vectorSearchPipeline } from "@/lib/db/vectorSearch";

describe("vectorSearchPipeline", () => {
  const orgId = new ObjectId();
  const vec = [0.1, 0.2, 0.3];

  it("always pre-filters by orgId inside $vectorSearch (tenant isolation)", () => {
    const [stage] = vectorSearchPipeline(orgId, vec, 8);
    expect(stage.$vectorSearch.filter).toEqual({ orgId });
    expect(stage.$vectorSearch.index).toBe(CHUNKS_VECTOR_INDEX);
    expect(stage.$vectorSearch.path).toBe("embedding");
    expect(stage.$vectorSearch.limit).toBe(8);
    expect(stage.$vectorSearch.numCandidates).toBeGreaterThanOrEqual(8 * 10);
  });

  it("projects the score and never the embedding", () => {
    const project = vectorSearchPipeline(orgId, vec, 4).find((s) => s.$project)?.$project;
    expect(project).toBeDefined();
    expect(project!.score).toEqual({ $meta: "vectorSearchScore" });
    expect(project!.embedding).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run it — must fail**

```powershell
npx vitest run tests/vectorSearch.test.ts
```

Expected: FAIL — cannot resolve `@/lib/db/vectorSearch`.

- [ ] **Step 4: Implement** — `src/lib/db/vectorSearch.ts`

```ts
import type { Db, Document, ObjectId } from "mongodb";
import type { Chunk } from "./types";

export const CHUNKS_VECTOR_INDEX = "chunks_vector_index";

export type ScoredChunk = Pick<
  Chunk,
  "_id" | "documentId" | "text" | "heading" | "position"
> & { score: number };

export function vectorSearchPipeline(
  orgId: ObjectId,
  queryVector: number[],
  k: number,
): Document[] {
  return [
    {
      $vectorSearch: {
        index: CHUNKS_VECTOR_INDEX,
        path: "embedding",
        queryVector,
        numCandidates: k * 15,
        limit: k,
        filter: { orgId },
      },
    },
    {
      $project: {
        documentId: 1,
        text: 1,
        heading: 1,
        position: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ];
}

export async function searchChunks(
  db: Db,
  orgId: ObjectId,
  queryVector: number[],
  k = 8,
): Promise<ScoredChunk[]> {
  return db
    .collection("chunks")
    .aggregate<ScoredChunk>(vectorSearchPipeline(orgId, queryVector, k))
    .toArray();
}
```

(`searchChunks` is the one sanctioned direct `db.collection("chunks")` read: the org filter is structurally guaranteed by `vectorSearchPipeline`, which the unit test locks.)

- [ ] **Step 5: Run it — must pass**

```powershell
npx vitest run tests/vectorSearch.test.ts
```

Expected: PASS.

- [ ] **Step 6: Live verification script (real Atlas, dummy vectors, isolation proof)** — `scripts/verify-vector-search.ts`

```ts
import { config } from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import { EMBEDDING_DIMS } from "../src/lib/ai/embeddings";
import { searchChunks } from "../src/lib/db/vectorSearch";

config({ path: ".env.local" });

function basisVector(i: number): number[] {
  const v = new Array(EMBEDDING_DIMS).fill(0);
  v[i] = 1;
  return v;
}

async function main() {
  const client = await MongoClient.connect(process.env.MONGODB_URI!);
  const db = client.db("supportai");
  const chunks = db.collection("chunks");
  const orgA = new ObjectId();
  const orgB = new ObjectId();
  const marker = `verify-vector-${Date.now()}`;

  await chunks.insertMany([
    { orgId: orgA, documentId: new ObjectId(), text: `${marker} orgA refunds`, embedding: basisVector(0), heading: null, position: 0 },
    { orgId: orgA, documentId: new ObjectId(), text: `${marker} orgA shipping`, embedding: basisVector(1), heading: null, position: 1 },
    { orgId: orgB, documentId: new ObjectId(), text: `${marker} orgB secret`, embedding: basisVector(0), heading: null, position: 0 },
  ]);

  try {
    // Search indexes build asynchronously — poll until our docs are visible.
    let hits: Awaited<ReturnType<typeof searchChunks>> = [];
    for (let attempt = 0; attempt < 24; attempt++) {
      hits = await searchChunks(db, orgA, basisVector(0), 5);
      if (hits.some((h) => h.text.startsWith(marker))) break;
      await new Promise((r) => setTimeout(r, 5000));
    }

    const texts = hits.map((h) => h.text).filter((t) => t.startsWith(marker));
    if (texts.length === 0) throw new Error("No results — is chunks_vector_index Active?");
    if (texts[0] !== `${marker} orgA refunds`) throw new Error(`Wrong top hit: ${texts[0]}`);
    if (texts.some((t) => t.includes("orgB"))) throw new Error("ISOLATION BREACH: orgB doc visible to orgA");
    console.log("vector search OK — top hit correct, orgB invisible to orgA");
  } finally {
    await chunks.deleteMany({ text: { $regex: `^${marker}` } });
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Add to `package.json` scripts:

```json
"db:verify-vector": "tsx scripts/verify-vector-search.ts"
```

- [ ] **Step 7: Run the live verification**

```powershell
npm run db:verify-vector
```

Expected: `vector search OK — top hit correct, orgB invisible to orgA`. If it times out, re-check Step 1 (index name, collection, Active state).

- [ ] **Step 8: Commit**

```powershell
git add src/lib/db/vectorSearch.ts tests/vectorSearch.test.ts scripts/verify-vector-search.ts package.json
git commit -m "feat: atlas vector search pipeline with org pre-filter and live verifier"
```

---

### Task 6: `ingest-document` task (+ Gemini scanned-PDF fallback)

**Files:**
- Create: `src/trigger/queues.ts`
- Create: `src/lib/ai/pdfExtract.ts`
- Create: `src/trigger/ingest-document.ts`

**Interfaces:**
- Consumes: `withOrg` + `insertMany` (Task 1), `chunkText` (Task 2), `extractFileText`/`looksScanned` (Task 3), `embedTexts` (Task 4), `getDb` (Phase 0), `chatModel` (Phase 0).
- Produces: exported `ingestion` queue (`concurrencyLimit: 1`) shared by Tasks 7 and 9; task id `"ingest-document"` with payload `{ orgId: string; sourceId: string }` (Task 10 triggers it); `extractPdfWithGemini(data: Uint8Array): Promise<string>`; run-metadata contract for the dashboard: `phase: "downloading" | "extracting" | "chunking" | "embedding" | "saving"`, `totalChunks: number`, `embeddedChunks: number`.
- Status protocol (all ingestion tasks follow it): source `pending → processing → ready` on success; `error` + `errorMessage` via the task's `onFailure` hook.

- [ ] **Step 1: Create the shared queue** — `src/trigger/queues.ts`

```ts
import { queue } from "@trigger.dev/sdk";

// One lane for every embedding/LLM-calling task: free-tier quotas are shared
// across all tenants, so ingestion is deliberately serial. Slow is fine; 429
// storms are not.
export const ingestion = queue({ name: "ingestion", concurrencyLimit: 1 });
```

- [ ] **Step 2: Gemini native-PDF fallback for scanned docs** — `src/lib/ai/pdfExtract.ts`

```ts
import { generateText } from "ai";
import { chatModel } from "@/lib/ai/provider";

/**
 * Scanned/image PDFs yield no text layer. Gemini reads PDFs natively (free
 * tier included), so we ask it to transcribe. Only called when
 * looksScanned() is true — every call costs daily chat quota.
 */
export async function extractPdfWithGemini(data: Uint8Array): Promise<string> {
  const { text } = await generateText({
    model: chatModel("google"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Transcribe the complete text content of this document. Output only the text, preserving headings as markdown '#' headings. Do not summarize, comment, or omit anything.",
          },
          { type: "file", data, mediaType: "application/pdf" },
        ],
      },
    ],
  });
  return text.trim();
}
```

- [ ] **Step 3: The task** — `src/trigger/ingest-document.ts`

```ts
import { ObjectId } from "mongodb";
import { logger, metadata, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { embedTexts } from "@/lib/ai/embeddings";
import { extractPdfWithGemini } from "@/lib/ai/pdfExtract";
import { getDb } from "@/lib/db/client";
import { withOrg } from "@/lib/db/withOrg";
import { chunkText } from "@/lib/ingest/chunk";
import { extractFileText, looksScanned } from "@/lib/ingest/extract";
import { ingestion } from "./queues";

const payloadSchema = z.object({ orgId: z.string(), sourceId: z.string() });

async function markSourceError(payload: { orgId: string; sourceId: string }, message: string) {
  const db = await getDb();
  await withOrg(db, new ObjectId(payload.orgId)).updateOne(
    "sources",
    { _id: new ObjectId(payload.sourceId) },
    { $set: { status: "error", errorMessage: message } },
  );
}

export const ingestDocument = schemaTask({
  id: "ingest-document",
  schema: payloadSchema,
  queue: ingestion,
  maxDuration: 900, // big PDFs + paced embedding batches
  onFailure: async ({ payload, error }) => {
    await markSourceError(payload, error instanceof Error ? error.message : String(error));
  },
  run: async (payload) => {
    const orgId = new ObjectId(payload.orgId);
    const sourceId = new ObjectId(payload.sourceId);
    const db = await getDb();
    const orgDb = withOrg(db, orgId);

    const source = await orgDb.findOne("sources", { _id: sourceId });
    if (!source) throw new Error(`Source ${payload.sourceId} not found in org`);
    if (source.config.kind !== "file") throw new Error("ingest-document requires a file source");

    await orgDb.updateOne("sources", { _id: sourceId }, { $set: { status: "processing", errorMessage: null } });

    metadata.set("phase", "downloading");
    const res = await fetch(source.config.blobUrl);
    if (!res.ok) throw new Error(`Blob download failed: ${res.status}`);
    const data = new Uint8Array(await res.arrayBuffer());

    metadata.set("phase", "extracting");
    let extracted = await extractFileText({
      data,
      contentType: source.config.contentType,
      filename: source.config.filename,
    });
    if (looksScanned(extracted)) {
      logger.info("scanned pdf detected — falling back to gemini transcription");
      const text = await extractPdfWithGemini(data);
      extracted = { ...extracted, text };
    }
    if (!extracted.text) throw new Error("No text could be extracted from the file");

    metadata.set("phase", "chunking");
    const chunks = chunkText(extracted.text);
    metadata.set("totalChunks", chunks.length).set("embeddedChunks", 0);

    metadata.set("phase", "embedding");
    const embeddings: number[][] = [];
    const BATCH = 100;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH);
      embeddings.push(...(await embedTexts(slice.map((c) => c.text))));
      metadata.set("embeddedChunks", Math.min(i + BATCH, chunks.length));
    }

    metadata.set("phase", "saving");
    // Re-ingesting a file source replaces its previous document + chunks.
    const oldDocs = await orgDb.find("documents", { sourceId }).toArray();
    if (oldDocs.length > 0) {
      const oldIds = oldDocs.map((d) => d._id);
      await orgDb.deleteMany("chunks", { documentId: { $in: oldIds } });
      await orgDb.deleteMany("documents", { sourceId });
    }

    const documentId = new ObjectId();
    await db.collection("documents").insertOne({
      _id: documentId,
      orgId,
      sourceId,
      title: extracted.title ?? source.name,
      rawText: extracted.text,
      meta: { filename: source.config.filename, pageCount: extracted.pageCount },
      createdAt: new Date(),
    });
    if (chunks.length > 0) {
      await orgDb.insertMany(
        "chunks",
        chunks.map((c, i) => ({ documentId, text: c.text, embedding: embeddings[i], heading: c.heading, position: c.position })),
      );
    }

    await orgDb.updateOne(
      "sources",
      { _id: sourceId },
      { $set: { status: "ready", lastSyncedAt: new Date(), chunkCount: chunks.length, errorMessage: null } },
    );
    return { documentId: documentId.toString(), chunks: chunks.length };
  },
});
```

(The raw `db.collection("documents").insertOne`/`insertMany` calls here and in Tasks 7 and 9 exist because `withOrg.insertOne` omits `_id` from the accepted shape, but the chunk batch needs the document's known `_id` up front — the same client-side-`_id` pattern Phase 1's Task 11 used for orgs. Every one of these inserts stamps `orgId` explicitly; all other access is `withOrg`.)

- [ ] **Step 4: Build + typecheck + register with the dev server**

```powershell
npm run build
npx trigger.dev@4.5.4 dev
```

Expected: build clean; the dev server lists `ingest-document` (and later tasks as they land). Stop the dev server (Ctrl+C) after confirming registration — full end-to-end runs happen in Task 10 once uploads exist, and in Task 12's walkthrough.

- [ ] **Step 5: Run the FULL test suite**

```powershell
npm test
```

Expected: all green (this task adds no unit tests — its logic lives in the already-tested libs; the task file is glue).

- [ ] **Step 6: Commit**

```powershell
git add src/trigger/queues.ts src/lib/ai/pdfExtract.ts src/trigger/ingest-document.ts
git commit -m "feat: ingest-document task with scanned-pdf fallback on serial ingestion queue"
```

---

### Task 7: `crawl-website` task — sitemap/BFS, main-content extraction, hash diffing

**Files:**
- Create: `src/lib/ingest/crawl.ts`
- Create: `tests/crawl.test.ts`
- Create: `src/trigger/crawl-website.ts`
- Modify: `package.json` (dep: `cheerio`)

**Interfaces:**
- Consumes: Task 1/2/4 outputs, `getDb`, `ingestion` queue (Task 6).
- Produces: pure helpers `parseSitemap(xml: string): string[]`, `extractMainContent(html: string): { title: string | null; text: string }` (headings preserved as markdown so `chunkText` stays heading-aware), `extractLinks(html: string, baseUrl: string): string[]`, `normalizeUrl(url: string): string`, `contentHash(text: string): string` (sha256 hex); task id `"crawl-website"` with payload `{ orgId: string; sourceId: string }`. Metadata contract: `phase: "discovering" | "crawling" | "embedding" | "saving"`, `discovered`, `crawled`, `changed`, `unchanged`.
- Crawl policy: same-origin only, `maxPages` clamped to 50, `maxDepth` clamped to 3, 500 ms politeness delay, 15 s per-page timeout, User-Agent `SupportAI-Crawler/0.1`.

- [ ] **Step 1: Install cheerio**

```powershell
npm install cheerio
```

- [ ] **Step 2: Write the failing tests** — `tests/crawl.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  contentHash,
  extractLinks,
  extractMainContent,
  normalizeUrl,
  parseSitemap,
} from "@/lib/ingest/crawl";

const page = `
<html><head><title>Help Center — Acme</title></head><body>
  <nav><a href="/pricing">Pricing nav noise</a></nav>
  <main>
    <h1>Refund policy</h1>
    <p>Refunds within 30 days.</p>
    <h2>Exceptions</h2>
    <p>Digital goods are final sale.</p>
    <script>track()</script>
  </main>
  <footer>© Acme</footer>
</body></html>`;

describe("extractMainContent", () => {
  it("keeps main content, drops nav/footer/script, preserves headings as markdown", () => {
    const { title, text } = extractMainContent(page);
    expect(title).toBe("Help Center — Acme");
    expect(text).toContain("# Refund policy");
    expect(text).toContain("## Exceptions");
    expect(text).toContain("Refunds within 30 days.");
    expect(text).not.toContain("Pricing nav noise");
    expect(text).not.toContain("© Acme");
    expect(text).not.toContain("track()");
  });

  it("falls back to body when there is no main/article", () => {
    const { text } = extractMainContent("<html><body><p>bare page</p></body></html>");
    expect(text).toBe("bare page");
  });
});

describe("parseSitemap", () => {
  it("extracts loc urls", () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://a.com/x</loc></url><url><loc>https://a.com/y</loc></url></urlset>`;
    expect(parseSitemap(xml)).toEqual(["https://a.com/x", "https://a.com/y"]);
  });
  it("returns [] for non-sitemap content", () => {
    expect(parseSitemap("<html>404</html>")).toEqual([]);
  });
});

describe("extractLinks", () => {
  it("resolves relative links against the base and keeps same-origin http(s) only", () => {
    const html = `<a href="/docs">d</a><a href="https://a.com/faq#top">f</a><a href="https://evil.com/x">e</a><a href="mailto:x@a.com">m</a>`;
    expect(extractLinks(html, "https://a.com/start")).toEqual([
      "https://a.com/docs",
      "https://a.com/faq",
    ]);
  });
});

describe("normalizeUrl", () => {
  it("strips hash fragments and trailing slashes", () => {
    expect(normalizeUrl("https://a.com/docs/#install")).toBe("https://a.com/docs");
    expect(normalizeUrl("https://a.com/")).toBe("https://a.com");
  });
});

describe("contentHash", () => {
  it("is stable for equal text and differs otherwise", () => {
    expect(contentHash("abc")).toBe(contentHash("abc"));
    expect(contentHash("abc")).not.toBe(contentHash("abd"));
    expect(contentHash("abc")).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

- [ ] **Step 3: Run — must fail**

```powershell
npx vitest run tests/crawl.test.ts
```

Expected: FAIL — cannot resolve `@/lib/ingest/crawl`.

- [ ] **Step 4: Implement the helpers** — `src/lib/ingest/crawl.ts`

```ts
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";

export function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function normalizeUrl(url: string): string {
  const u = new URL(url);
  u.hash = "";
  let s = u.toString();
  if (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

export function parseSitemap(xml: string): string[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $("url > loc")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const origin = new URL(baseUrl).origin;
  const out: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const abs = new URL(href, baseUrl);
      if (abs.origin !== origin) return;
      if (abs.protocol !== "http:" && abs.protocol !== "https:") return;
      const normalized = normalizeUrl(abs.toString());
      if (!out.includes(normalized)) out.push(normalized);
    } catch {
      // unparseable href — skip
    }
  });
  return out;
}

const NOISE_SELECTORS = "script, style, noscript, nav, header, footer, aside, form, iframe, svg";

export function extractMainContent(html: string): { title: string | null; text: string } {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || $("h1").first().text().trim() || null;

  const $root = $("main").length
    ? $("main").first()
    : $("article").length
      ? $("article").first()
      : $('[role="main"]').length
        ? $('[role="main"]').first()
        : $("body");
  $root.find(NOISE_SELECTORS).remove();

  const lines: string[] = [];
  $root.find("h1, h2, h3, h4, h5, h6, p, li, td, pre, blockquote").each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (!t) return;
    if (tag.startsWith("h")) {
      lines.push(`${"#".repeat(Number(tag[1]))} ${t}`);
    } else {
      lines.push(t);
    }
  });
  // Fallback for pages with no structural elements at all
  const text = lines.length ? lines.join("\n\n") : $root.text().replace(/\s+/g, " ").trim();
  return { title, text };
}
```

- [ ] **Step 5: Run — must pass**

```powershell
npx vitest run tests/crawl.test.ts
```

Expected: PASS (8 tests).

- [ ] **Step 6: The task** — `src/trigger/crawl-website.ts`

```ts
import { ObjectId } from "mongodb";
import { logger, metadata, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { embedTexts } from "@/lib/ai/embeddings";
import { getDb } from "@/lib/db/client";
import { withOrg } from "@/lib/db/withOrg";
import { chunkText } from "@/lib/ingest/chunk";
import {
  contentHash,
  extractLinks,
  extractMainContent,
  normalizeUrl,
  parseSitemap,
} from "@/lib/ingest/crawl";
import { ingestion } from "./queues";

const MAX_PAGES_CAP = 50;
const MAX_DEPTH_CAP = 3;
const POLITENESS_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "SupportAI-Crawler/0.1" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html") && !type.includes("xml")) return null;
    return await res.text();
  } catch (err) {
    logger.warn("fetch failed", { url, err: String(err) });
    return null;
  }
}

export const crawlWebsite = schemaTask({
  id: "crawl-website",
  schema: z.object({ orgId: z.string(), sourceId: z.string() }),
  queue: ingestion,
  maxDuration: 1800, // 50 pages * (fetch + politeness) + paced embedding
  onFailure: async ({ payload, error }) => {
    const db = await getDb();
    await withOrg(db, new ObjectId(payload.orgId)).updateOne(
      "sources",
      { _id: new ObjectId(payload.sourceId) },
      { $set: { status: "error", errorMessage: error instanceof Error ? error.message : String(error) } },
    );
  },
  run: async (payload) => {
    const orgId = new ObjectId(payload.orgId);
    const sourceId = new ObjectId(payload.sourceId);
    const db = await getDb();
    const orgDb = withOrg(db, orgId);

    const source = await orgDb.findOne("sources", { _id: sourceId });
    if (!source) throw new Error(`Source ${payload.sourceId} not found in org`);
    if (source.config.kind !== "crawl") throw new Error("crawl-website requires a crawl source");
    const maxPages = Math.min(source.config.maxPages, MAX_PAGES_CAP);
    const maxDepth = Math.min(source.config.maxDepth, MAX_DEPTH_CAP);
    const rootUrl = normalizeUrl(source.config.rootUrl);

    await orgDb.updateOne("sources", { _id: sourceId }, { $set: { status: "processing", errorMessage: null } });

    // --- discover ---
    metadata.set("phase", "discovering");
    const origin = new URL(rootUrl).origin;
    let queue: { url: string; depth: number }[];
    const sitemapXml = await fetchPage(`${origin}/sitemap.xml`);
    const sitemapUrls = sitemapXml ? parseSitemap(sitemapXml).filter((u) => u.startsWith(origin)) : [];
    if (sitemapUrls.length > 0) {
      queue = sitemapUrls.slice(0, maxPages).map((u) => ({ url: normalizeUrl(u), depth: 0 }));
    } else {
      queue = [{ url: rootUrl, depth: 0 }];
    }
    metadata.set("discovered", queue.length);

    // --- crawl ---
    metadata.set("phase", "crawling").set("crawled", 0).set("changed", 0).set("unchanged", 0);
    const visited = new Set<string>();
    const changedPages: { url: string; title: string | null; text: string; hash: string }[] = [];
    let crawled = 0;
    let unchanged = 0;

    while (queue.length > 0 && crawled < maxPages) {
      const { url, depth } = queue.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);

      const html = await fetchPage(url);
      await sleep(POLITENESS_MS);
      if (html === null) continue;
      crawled++;
      metadata.set("crawled", crawled);

      const { title, text } = extractMainContent(html);
      if (text.length >= 80) {
        const hash = contentHash(text);
        const existing = await orgDb.findOne("documents", { sourceId, "meta.url": url });
        if (existing && (existing.meta as { contentHash?: string }).contentHash === hash) {
          unchanged++;
          metadata.set("unchanged", unchanged);
        } else {
          changedPages.push({ url, title, text, hash });
          metadata.set("changed", changedPages.length);
        }
      }

      if (sitemapUrls.length === 0 && depth < maxDepth) {
        for (const link of extractLinks(html, url)) {
          if (!visited.has(link)) queue.push({ url: link, depth: depth + 1 });
        }
        metadata.set("discovered", visited.size + queue.length);
      }
    }

    // --- embed + save changed pages ---
    metadata.set("phase", "embedding");
    for (const pageData of changedPages) {
      const chunks = chunkText(pageData.text);
      if (chunks.length === 0) continue;
      const embeddings = await embedTexts(chunks.map((c) => c.text));

      metadata.set("phase", "saving");
      const old = await orgDb.findOne("documents", { sourceId, "meta.url": pageData.url });
      if (old) {
        await orgDb.deleteMany("chunks", { documentId: old._id });
        await orgDb.deleteMany("documents", { _id: old._id });
      }
      const documentId = new ObjectId();
      await db.collection("documents").insertOne({
        _id: documentId,
        orgId,
        sourceId,
        title: pageData.title ?? pageData.url,
        rawText: pageData.text,
        meta: { url: pageData.url, contentHash: pageData.hash },
        createdAt: new Date(),
      });
      await orgDb.insertMany(
        "chunks",
        chunks.map((c) => ({ documentId, text: c.text, embedding: embeddings[c.position], heading: c.heading, position: c.position })),
      );
      metadata.set("phase", "embedding");
    }

    const chunkCount = await orgDb.countDocuments("chunks", {
      documentId: { $in: (await orgDb.find("documents", { sourceId }).toArray()).map((d) => d._id) },
    });
    await orgDb.updateOne(
      "sources",
      { _id: sourceId },
      { $set: { status: "ready", lastSyncedAt: new Date(), chunkCount, errorMessage: null } },
    );
    return { crawled, changed: changedPages.length, unchanged, chunkCount };
  },
});
```

- [ ] **Step 7: Build + full suite**

```powershell
npm run build
npm test
```

Expected: both clean.

- [ ] **Step 8: Commit**

```powershell
git add src/lib/ingest/crawl.ts tests/crawl.test.ts src/trigger/crawl-website.ts package.json package-lock.json
git commit -m "feat: crawl-website task with sitemap discovery and content-hash diffing"
```

---

### Task 8: Scheduled re-crawls

**Files:**
- Create: `src/lib/ingest/recrawl.ts`
- Create: `tests/recrawl.test.ts`
- Create: `src/trigger/scheduled-recrawl.ts`

**Interfaces:**
- Consumes: `Source` type (Task 1), task id `"crawl-website"` (Task 7).
- Produces: pure `isDueForRecrawl(source: Pick<Source, "type" | "status" | "crawlSchedule" | "lastSyncedAt">, now: Date): boolean`; scheduled task id `"scheduled-recrawl"` (cron, every 6 h). This task performs the plan's **documented cross-org read exception** (finding due sources across all orgs); its writes go through the triggered crawl task.

- [ ] **Step 1: Write the failing test** — `tests/recrawl.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { isDueForRecrawl } from "@/lib/ingest/recrawl";

const now = new Date("2026-07-19T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

const base = { type: "crawl" as const, status: "ready" as const };

describe("isDueForRecrawl", () => {
  it("daily source synced 25h ago is due; 23h ago is not", () => {
    expect(isDueForRecrawl({ ...base, crawlSchedule: "daily", lastSyncedAt: hoursAgo(25) }, now)).toBe(true);
    expect(isDueForRecrawl({ ...base, crawlSchedule: "daily", lastSyncedAt: hoursAgo(23) }, now)).toBe(false);
  });

  it("weekly source synced 8 days ago is due; 6 days ago is not", () => {
    expect(isDueForRecrawl({ ...base, crawlSchedule: "weekly", lastSyncedAt: hoursAgo(24 * 8) }, now)).toBe(true);
    expect(isDueForRecrawl({ ...base, crawlSchedule: "weekly", lastSyncedAt: hoursAgo(24 * 6) }, now)).toBe(false);
  });

  it("never-synced scheduled source is due", () => {
    expect(isDueForRecrawl({ ...base, crawlSchedule: "daily", lastSyncedAt: null }, now)).toBe(true);
  });

  it("unscheduled, non-crawl, or currently-processing sources are never due", () => {
    expect(isDueForRecrawl({ ...base, crawlSchedule: null, lastSyncedAt: hoursAgo(100) }, now)).toBe(false);
    expect(isDueForRecrawl({ type: "file", status: "ready", crawlSchedule: "daily", lastSyncedAt: hoursAgo(100) }, now)).toBe(false);
    expect(isDueForRecrawl({ type: "crawl", status: "processing", crawlSchedule: "daily", lastSyncedAt: hoursAgo(100) }, now)).toBe(false);
  });

  it("errored crawl sources retry on schedule (transient site outages heal)", () => {
    expect(isDueForRecrawl({ type: "crawl", status: "error", crawlSchedule: "daily", lastSyncedAt: hoursAgo(25) }, now)).toBe(true);
  });
});
```

- [ ] **Step 2: Run — must fail**

```powershell
npx vitest run tests/recrawl.test.ts
```

Expected: FAIL — cannot resolve `@/lib/ingest/recrawl`.

- [ ] **Step 3: Implement** — `src/lib/ingest/recrawl.ts`

```ts
import type { Source } from "@/lib/db/types";

const INTERVAL_HOURS: Record<"daily" | "weekly", number> = {
  daily: 24,
  weekly: 24 * 7,
};

export function isDueForRecrawl(
  source: Pick<Source, "type" | "status" | "crawlSchedule" | "lastSyncedAt">,
  now: Date,
): boolean {
  if (source.type !== "crawl") return false;
  if (source.crawlSchedule === null) return false;
  if (source.status === "processing" || source.status === "pending") return false;
  if (source.lastSyncedAt === null) return true;
  const ageHours = (now.getTime() - source.lastSyncedAt.getTime()) / 3_600_000;
  return ageHours >= INTERVAL_HOURS[source.crawlSchedule];
}
```

- [ ] **Step 4: Run — must pass**

```powershell
npx vitest run tests/recrawl.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: The scheduled task** — `src/trigger/scheduled-recrawl.ts`

```ts
import { logger, schedules, tasks } from "@trigger.dev/sdk";
import type { Source } from "@/lib/db/types";
import { getDb } from "@/lib/db/client";
import { isDueForRecrawl } from "@/lib/ingest/recrawl";
import type { crawlWebsite } from "./crawl-website";

export const scheduledRecrawl = schedules.task({
  id: "scheduled-recrawl",
  cron: "0 */6 * * *", // every 6h; isDueForRecrawl enforces the real cadence
  run: async () => {
    const db = await getDb();
    // Documented cross-org READ exception (see plan Global Constraints):
    // scheduling must scan all orgs' crawl sources. Writes stay org-scoped
    // inside crawl-website.
    const candidates = await db
      .collection<Source>("sources")
      .find({ type: "crawl", crawlSchedule: { $ne: null } })
      .toArray();

    const now = new Date();
    const due = candidates.filter((s) => isDueForRecrawl(s, now));
    logger.info("recrawl sweep", { candidates: candidates.length, due: due.length });

    for (const source of due) {
      await tasks.trigger<typeof crawlWebsite>(
        "crawl-website",
        { orgId: source.orgId.toString(), sourceId: source._id.toString() },
        { tags: [`org:${source.orgId.toString()}`, `source:${source._id.toString()}`] },
      );
    }
    return { triggered: due.length };
  },
});
```

- [ ] **Step 6: Build + full suite + commit**

```powershell
npm run build
npm test
git add src/lib/ingest/recrawl.ts tests/recrawl.test.ts src/trigger/scheduled-recrawl.ts
git commit -m "feat: six-hourly recrawl sweep honoring daily/weekly source schedules"
```

---

### Task 9: `import-tickets` task — CSV + mbox

**Files:**
- Create: `src/lib/ingest/tickets.ts`
- Create: `tests/tickets.test.ts`
- Create: `src/trigger/import-tickets.ts`
- Modify: `package.json` (deps: `papaparse`, `@types/papaparse`)

**Interfaces:**
- Consumes: Task 1/2/4 outputs, `ingestion` queue.
- Produces: `parseTicketsCsv(text: string): ImportedTicket[]`, `parseMbox(text: string): ImportedTicket[]` with `ImportedTicket = { title: string; body: string }`; task id `"import-tickets"` with payload `{ orgId: string; sourceId: string }`. Metadata contract: `phase`, `totalTickets`, `embeddedChunks`, `totalChunks`.
- CSV column mapping: header row required; the question/title column is the first header matching `/question|subject|title/i`, the answer/body column the first matching `/answer|body|resolution|description|reply/i`; if neither matches, columns 1 and 2 are used. Rows with an empty title are skipped.

- [ ] **Step 1: Install papaparse**

```powershell
npm install papaparse
npm install --save-dev @types/papaparse
```

- [ ] **Step 2: Write the failing tests** — `tests/tickets.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { parseMbox, parseTicketsCsv } from "@/lib/ingest/tickets";

describe("parseTicketsCsv", () => {
  it("maps question/answer-ish headers case-insensitively", () => {
    const csv = 'Subject,Resolution,Agent\n"Login fails","Reset via /forgot","sam"\n"Billing?","See pricing page","kim"';
    expect(parseTicketsCsv(csv)).toEqual([
      { title: "Login fails", body: "Reset via /forgot" },
      { title: "Billing?", body: "See pricing page" },
    ]);
  });

  it("falls back to the first two columns when no header matches", () => {
    const csv = "colA,colB\nhello,world";
    expect(parseTicketsCsv(csv)).toEqual([{ title: "hello", body: "world" }]);
  });

  it("skips rows with an empty title and handles quoted newlines", () => {
    const csv = 'question,answer\n"","orphan"\n"Multi\nline","ok"';
    expect(parseTicketsCsv(csv)).toEqual([{ title: "Multi\nline", body: "ok" }]);
  });
});

describe("parseMbox", () => {
  const mbox = [
    "From alice@example.com Thu Jul 16 10:00:00 2026",
    "Subject: Cannot reset password",
    "To: support@acme.com",
    "",
    "The reset link 404s.",
    "Thanks, Alice",
    "From bob@example.com Fri Jul 17 09:00:00 2026",
    "Subject: Invoice question",
    "",
    "Where do I download invoices?",
  ].join("\n");

  it("splits messages on From_ lines and extracts Subject + body", () => {
    expect(parseMbox(mbox)).toEqual([
      { title: "Cannot reset password", body: "The reset link 404s.\nThanks, Alice" },
      { title: "Invoice question", body: "Where do I download invoices?" },
    ]);
  });

  it("skips messages with no body and defaults a missing subject", () => {
    const m = "From x@y.z Thu Jul 16 10:00:00 2026\nSubject: Empty\n\n\nFrom a@b.c Thu Jul 16 11:00:00 2026\n\nBody without subject";
    expect(parseMbox(m)).toEqual([{ title: "(no subject)", body: "Body without subject" }]);
  });

  it("returns [] for non-mbox text", () => {
    expect(parseMbox("just some text")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run — must fail**

```powershell
npx vitest run tests/tickets.test.ts
```

Expected: FAIL — cannot resolve `@/lib/ingest/tickets`.

- [ ] **Step 4: Implement** — `src/lib/ingest/tickets.ts`

```ts
import Papa from "papaparse";

export interface ImportedTicket {
  title: string;
  body: string;
}

export function parseTicketsCsv(text: string): ImportedTicket[] {
  const { data, meta } = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
  });
  const headers = meta.fields ?? [];
  const titleCol =
    headers.find((h) => /question|subject|title/i.test(h)) ?? headers[0];
  const bodyCol =
    headers.find((h) => /answer|body|resolution|description|reply/i.test(h)) ??
    headers[1] ??
    headers[0];

  return data
    .map((row) => ({
      title: (row[titleCol] ?? "").trim(),
      body: (row[bodyCol] ?? "").trim(),
    }))
    .filter((t) => t.title.length > 0);
}

const FROM_LINE = /^From \S+.*$/m;

export function parseMbox(text: string): ImportedTicket[] {
  if (!FROM_LINE.test(text)) return [];
  const messages = text.split(/^From \S+.*$/m).slice(1); // drop pre-first-From prefix
  const out: ImportedTicket[] = [];
  for (const raw of messages) {
    const msg = raw.replace(/^\n/, "");
    const sepIndex = msg.indexOf("\n\n");
    const headerBlock = sepIndex === -1 ? msg : msg.slice(0, sepIndex);
    const body = (sepIndex === -1 ? "" : msg.slice(sepIndex + 2)).trim();
    if (!body) continue;
    const subject = /^Subject:\s*(.+)$/im.exec(headerBlock)?.[1]?.trim();
    out.push({ title: subject || "(no subject)", body });
  }
  return out;
}
```

- [ ] **Step 5: Run — must pass**

```powershell
npx vitest run tests/tickets.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 6: The task** — `src/trigger/import-tickets.ts`

```ts
import { ObjectId } from "mongodb";
import { metadata, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { embedTexts } from "@/lib/ai/embeddings";
import { getDb } from "@/lib/db/client";
import { withOrg } from "@/lib/db/withOrg";
import { chunkText } from "@/lib/ingest/chunk";
import { parseMbox, parseTicketsCsv } from "@/lib/ingest/tickets";
import { ingestion } from "./queues";

export const importTickets = schemaTask({
  id: "import-tickets",
  schema: z.object({ orgId: z.string(), sourceId: z.string() }),
  queue: ingestion,
  maxDuration: 900,
  onFailure: async ({ payload, error }) => {
    const db = await getDb();
    await withOrg(db, new ObjectId(payload.orgId)).updateOne(
      "sources",
      { _id: new ObjectId(payload.sourceId) },
      { $set: { status: "error", errorMessage: error instanceof Error ? error.message : String(error) } },
    );
  },
  run: async (payload) => {
    const orgId = new ObjectId(payload.orgId);
    const sourceId = new ObjectId(payload.sourceId);
    const db = await getDb();
    const orgDb = withOrg(db, orgId);

    const source = await orgDb.findOne("sources", { _id: sourceId });
    if (!source) throw new Error(`Source ${payload.sourceId} not found in org`);
    if (source.config.kind !== "ticket-import") throw new Error("import-tickets requires a ticket-import source");

    await orgDb.updateOne("sources", { _id: sourceId }, { $set: { status: "processing", errorMessage: null } });

    metadata.set("phase", "downloading");
    const res = await fetch(source.config.blobUrl);
    if (!res.ok) throw new Error(`Blob download failed: ${res.status}`);
    const text = await res.text();

    metadata.set("phase", "parsing");
    const tickets = source.config.format === "csv" ? parseTicketsCsv(text) : parseMbox(text);
    if (tickets.length === 0) throw new Error("No tickets could be parsed from the file");
    metadata.set("totalTickets", tickets.length);

    // Re-import replaces this source's previous documents + chunks.
    const oldDocs = await orgDb.find("documents", { sourceId }).toArray();
    if (oldDocs.length > 0) {
      await orgDb.deleteMany("chunks", { documentId: { $in: oldDocs.map((d) => d._id) } });
      await orgDb.deleteMany("documents", { sourceId });
    }

    // One document per ticket; chunk each; embed everything in one paced pass.
    metadata.set("phase", "embedding");
    const perDoc = tickets.map((t) => {
      const documentId = new ObjectId();
      const rawText = `# ${t.title}\n\n${t.body}`;
      return { documentId, title: t.title, rawText, chunks: chunkText(rawText) };
    });
    const allTexts = perDoc.flatMap((d) => d.chunks.map((c) => c.text));
    metadata.set("totalChunks", allTexts.length).set("embeddedChunks", 0);
    const allEmbeddings = await embedTexts(allTexts);
    metadata.set("embeddedChunks", allTexts.length);

    metadata.set("phase", "saving");
    await db.collection("documents").insertMany(
      perDoc.map((d) => ({
        _id: d.documentId,
        orgId,
        sourceId,
        title: d.title,
        rawText: d.rawText,
        meta: { kind: "ticket-import" },
        createdAt: new Date(),
      })),
    );
    let cursor = 0;
    const chunkDocs = perDoc.flatMap((d) =>
      d.chunks.map((c) => ({
        documentId: d.documentId,
        text: c.text,
        embedding: allEmbeddings[cursor++],
        heading: c.heading,
        position: c.position,
      })),
    );
    if (chunkDocs.length > 0) await orgDb.insertMany("chunks", chunkDocs);

    await orgDb.updateOne(
      "sources",
      { _id: sourceId },
      { $set: { status: "ready", lastSyncedAt: new Date(), chunkCount: chunkDocs.length, errorMessage: null } },
    );
    return { tickets: tickets.length, chunks: chunkDocs.length };
  },
});
```

- [ ] **Step 7: Build + full suite + commit**

```powershell
npm run build
npm test
git add src/lib/ingest/tickets.ts tests/tickets.test.ts src/trigger/import-tickets.ts package.json package-lock.json
git commit -m "feat: import-tickets task with csv and mbox parsing"
```

---

### Task 10: Source server actions + Vercel Blob upload

**Files:**
- Create: `src/app/actions/sources.ts`
- Modify: `src/lib/env.ts` (add `BLOB_READ_WRITE_TOKEN`)
- Modify: `.env.example` (document the new var)
- Modify: `tests/env.test.ts` (extend the valid-env fixture)
- Modify: `package.json` (dep: `@vercel/blob`)

**Interfaces:**
- Consumes: `createOrg`-era auth patterns (Phase 1 `actions/orgs.ts`), `withOrg`, `Source`/`SourceConfig` (Task 1), task ids from Tasks 6/7/9.
- Produces server actions (all membership-checked against the user's `activeOrgId`, all revalidating `/dashboard/sources`):
  - `createFileSourceAction(prev: SourceActionState, formData: FormData): Promise<SourceActionState>` — expects `file`.
  - `createCrawlSourceAction(prev, formData)` — expects `rootUrl`, `maxPages`, `schedule` (`"none" | "daily" | "weekly"`).
  - `createTicketImportSourceAction(prev, formData)` — expects `file` (`.csv` or `.mbox`).
  - `retrySourceAction(formData)` — expects `sourceId`; re-triggers the matching task.
  - `deleteSourceAction(formData)` — expects `sourceId`; deletes chunks → documents → blob → source.
  - `SourceActionState = { ok?: boolean; error?: string }`.
- Every trigger call sets `tags: ["org:<orgId>", "source:<sourceId>"]` and writes the returned `handle.id` to `source.lastRunId` — the dashboard's Realtime mapping key.

- [ ] **Step 1: CHECKPOINT (user) — create the Blob store**

Vercel dashboard → **supportai** project → **Storage** tab → **Create Database → Blob** (Hobby: 1 GB storage / 10 GB transfer, free, no card) → **Connect to project**. This injects `BLOB_READ_WRITE_TOKEN` into the project's Vercel envs. Then copy the token (Storage → your blob store → `.env.local` snippet) and paste `BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...` into `D:\Business\supportai\.env.local`.

- [ ] **Step 2: Install the SDK**

```powershell
npm install @vercel/blob
```

- [ ] **Step 3: Env validation (RED → GREEN)**

In `tests/env.test.ts`, add `BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test",` to the `valid` fixture object (after `TRIGGER_SECRET_KEY`), and add this test inside the `describe("loadEnv", ...)` block:

```ts
  it("requires BLOB_READ_WRITE_TOKEN", () => {
    const { BLOB_READ_WRITE_TOKEN: _omitted, ...rest } = valid;
    expect(() => loadEnv(rest as unknown as NodeJS.ProcessEnv)).toThrowError(
      /BLOB_READ_WRITE_TOKEN/,
    );
  });
```

Run `npx vitest run tests/env.test.ts` — the new test FAILS. Then add to the schema object in `src/lib/env.ts` (after `TRIGGER_SECRET_KEY`):

```ts
  BLOB_READ_WRITE_TOKEN: z.string().min(1, "required"),
```

Run again — PASSES. Add the line `BLOB_READ_WRITE_TOKEN=   # Vercel Blob store (Storage tab of the Vercel project)` to `.env.example`.

- [ ] **Step 4: Implement the actions** — `src/app/actions/sources.ts`

```ts
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
```

- [ ] **Step 5: Build + full suite**

```powershell
npm run build
npm test
```

Expected: both clean. (The actions are auth-gated glue over tested libs, same as Phase 1's `actions/orgs.ts` — no dedicated unit tests; Task 12's walkthrough exercises them end-to-end.)

- [ ] **Step 6: Commit**

```powershell
git add src/app/actions/sources.ts src/lib/env.ts .env.example tests/env.test.ts package.json package-lock.json
git commit -m "feat: source create/retry/delete actions with blob upload and tagged triggers"
```

---

### Task 11: Sources dashboard — live ingestion status via Trigger.dev Realtime

**Files:**
- Create: `src/app/dashboard/sources/page.tsx`
- Create: `src/app/dashboard/sources/sources-panel.tsx`
- Modify: `src/app/dashboard/page.tsx` (nav link)
- Modify: `package.json` (dep: `@trigger.dev/react-hooks`)

**Interfaces:**
- Consumes: server actions (Task 10), `withOrg` (Phase 1), `auth.createPublicToken` from `@trigger.dev/sdk`, run-metadata contracts (Tasks 6/7/9), `Source` (Task 1).
- Produces: `/dashboard/sources` — the page Phase 4's inbox sits beside and the template every later "live background work" screen follows. `SerializedSource` (client-safe source projection) is defined in `sources-panel.tsx`.
- Design intent (this is a real product surface, not a smoke route): stays inside the dashboard's existing utilitarian Tailwind idiom (indigo actions, bordered cards) but earns its keep — status pills with a pulse on live runs, per-run phase + progress from Realtime metadata, honest error surfaces with retry, and an empty state that tells the user exactly what to do first. No new fonts/deps beyond the hooks package.

- [ ] **Step 1: Install the hooks**

```powershell
npm install @trigger.dev/react-hooks
```

- [ ] **Step 2: Server page** — `src/app/dashboard/sources/page.tsx`

```tsx
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
```

- [ ] **Step 3: Client panel** — `src/app/dashboard/sources/sources-panel.tsx`

```tsx
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
```

(Realtime pushes run/metadata updates; the `pending/processing → ready` flip of the *source document* itself appears on refresh or the next `revalidatePath`. That's acceptable for Phase 2 — noted in "Deferred".)

- [ ] **Step 4: Nav link** — in `src/app/dashboard/page.tsx`, inside the header `<div className="flex items-center justify-between">`, immediately before the sign-out `<form>`, add:

```tsx
        <a href="/dashboard/sources" className="text-sm text-indigo-700 underline">
          Knowledge sources
        </a>
```

- [ ] **Step 5: Build + full suite**

```powershell
npm run build
npm test
```

Expected: both clean; new route `ƒ /dashboard/sources` appears in the build output.

- [ ] **Step 6: Commit**

```powershell
git add src/app/dashboard/sources src/app/dashboard/page.tsx package.json package-lock.json
git commit -m "feat: sources dashboard with live realtime ingestion status"
```

---

### Task 12: Wire-up, deploy, and the Phase 2 walkthrough

**Files:**
- Modify: none expected (deploy + verification task).

**Interfaces:**
- Consumes: everything above.
- Produces: Phase 2 in production; the spec's done-when proven.

- [ ] **Step 1: Full local gate**

```powershell
npm run build
npm test
```

Expected: clean build; all test files pass (Phase 0/1's plus `withOrgInsertMany`, `chunk`, `extract`, `embeddings`, `vectorSearch`, `crawl`, `recrawl`, `tickets`).

- [ ] **Step 2: End-to-end in dev (agent-executable part)**

Run in two background terminals: `npm run dev` and `npx trigger.dev@4.5.4 dev` (dev reads `.env.local` automatically — Mongo, Gemini, and Blob env all present after Task 10's checkpoint).

Then create a test file source through the real stack: sign-in is browser-bound, so this step uses a seeded markdown upload via the UI **in Step 4**; here, verify the tasks register:

```powershell
curl.exe -s http://localhost:3000/api/health
```

Expected: `{"ok":true,...}`; the trigger dev terminal lists `ingest-document`, `crawl-website`, `import-tickets`, `scheduled-recrawl`.

- [ ] **Step 3: CHECKPOINT (user) — Trigger.dev prod env vars**

Trigger.dev dashboard → project **supportai** → **Environment Variables** → **prod** environment → add:

| Name | Value |
|---|---|
| `MONGODB_URI` | same as `.env.local` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | same as `.env.local` |

(The prod tasks read blobs via public URLs and never send email, so only these two are needed. `.env.local` already covers the dev environment.)

- [ ] **Step 4: CHECKPOINT (user) — the Phase 2 browser walkthrough (dev)**

With both dev servers running, at http://localhost:3000/dashboard → **Knowledge sources**:

1. **Upload** a real PDF (any product doc < 4.5 MB) → row appears, pill pulses through `downloading → extracting → chunking → embedding → saving` with a moving progress bar → **ready · N chunks**.
2. **Crawl** a small real site (e.g. your own docs, `maxPages` 5, re-crawl none) → watch `crawled/discovered` climb → ready.
3. **Import** a 3-row CSV (`subject,resolution` headers) → ready with chunks.
4. Run `npm run db:verify-vector` → still passes with real data present.
5. Org isolation: switch to the second org (Phase 1's Beta) → its Knowledge sources page is **empty**; switch back — everything intact.
6. Delete the CSV source → row disappears; its chunks are gone (`Re-sync` another source still works).

This is the spec's Phase 2 done-when: *"an org can upload a PDF, point at a help-center URL, import a ticket CSV, and see searchable chunks."*

- [ ] **Step 5: Deploy**

```powershell
npx vercel --prod
npx trigger.dev@4.5.4 deploy
```

Expected: Vercel deploys with the new route; Trigger.dev deploys a version listing all four tasks (schedule `scheduled-recrawl` auto-registers, visible under Schedules in the dashboard).

- [ ] **Step 6: Verify production**

```powershell
curl.exe -s https://supportai-beta.vercel.app/api/health
```

Expected: `{"ok":true,...}`. Then repeat walkthrough item 1 once on production (sign in, upload one small MD file, watch it turn ready). Confirm the run appears as **completed** in the Trigger.dev prod environment.

- [ ] **Step 7: Commit anything changed + close out**

```powershell
git add -A
git commit -m "chore: phase 2 production deploy" --allow-empty
```

---

## Done-when mapping (spec §6 Phase 2 → plan)

| Spec criterion | Where proven |
|---|---|
| Upload PDFs/DOCX/MD/TXT → file storage → `tasks.trigger("ingest-document")` | Tasks 10 + 6; walkthrough item 1 |
| Parse (text extraction; Gemini PDF fallback for scanned docs) | Task 3 + Task 6 Step 2 |
| Clean, chunk (~500–800 tokens, heading-aware) | Task 2 |
| Embed (batched, rate-limit-paced), upsert `chunks` | Task 4 + tasks 6/7/9 (serial queue) |
| `crawl-website`: sitemap/URL → main content → chunk/embed; depth + page caps | Task 7 |
| Scheduled re-crawl with content-hash diffing | Task 7 (diffing) + Task 8 (schedule) |
| Past tickets/emails import (CSV/mbox) tagged `ticket-import` | Task 9 |
| Dashboard source list with live ingestion status (Realtime) | Task 11 |
| Embedding decision point resolved before ingesting at scale | "The embedding decision" section (locked: Gemini 768) |
| Atlas Vector Search index (manual UI step, exact config) | Task 5 Step 1 checkpoint |
| Searchable chunks proven org-isolated | Task 5 verifier + walkthrough item 5 |

## Explicitly deferred (with reasons)

- **`llmUsage` counters for embedding calls** — spec §6 places usage counters in Phase 3; requires a `withOrg` upsert primitive that doesn't exist yet. Add both together in the Phase 3 plan.
- **Files > 4.5 MB** (Vercel Blob client uploads with `onUploadCompleted`) — pilot KB docs fit; revisit when a real org hits the cap.
- **Deleting documents for pages that vanished from a crawled site** — needs tombstone bookkeeping; harmless staleness at pilot scale.
- **Per-source dynamic cron via `schedules.create`** — the 6-hourly sweep + `isDueForRecrawl` gives daily/weekly semantics with zero schedule-lifecycle management.
- **JS-rendered sites (Playwright crawling)** — spec defers this until a real target demands it.
- **Live flip of the source row's final `ready` state without refresh** — Realtime covers the run; a `router.refresh()` on run-completion (`onComplete`) is a two-line Phase 3 nicety.
- **`documents.meta.url` compound index** — crawl diffing does per-URL lookups; fine on M0 at ≤ 50 pages/source, index it when crawl volume grows.
- **mbox attachments / HTML e-mail bodies** — plain-text bodies only for the pilot.

## Free-tier budget impact of this phase

| Resource | This phase uses | Ceiling |
|---|---|---|
| Vercel Blob | uploaded source files | 1 GB storage / 10 GB transfer/mo (project pauses, no billing) |
| Gemini embeddings | ~10 requests per 200-page ingest (batch 100) | ~1,000 req/day free (verify at Task 4 Step 5) |
| Gemini chat | scanned-PDF transcription only | shares the chat daily quota — rare path |
| Trigger.dev | serial queue, paced batches, `maxDuration` capped | free-tier monthly credit; waits are free |
| Atlas M0 | chunks ≈ 10 KB each (768 floats + text) → ~50 K chunk headroom | 512 MB storage; 1 of 3 search indexes used |
