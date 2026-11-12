import { embedMany, type EmbeddingModel } from "ai";
import { embeddingModel, isRateLimitError } from "@/lib/ai/provider";

export const EMBEDDING_DIMS = 768;

/**
 * Gemini's free tier allows 100 embedded texts a minute, and every text in a
 * batch counts. Crawling a 50-page site produces a few hundred chunks, so the
 * old "100 per call, 0.7s apart, one 30s retry" overran the limit and the
 * crawl failed ("Quota exceeded ... retry in 55s"). Stay under it instead:
 * send at most EMBEDS_PER_MINUTE texts in any 60-second window, and when
 * Gemini still says "slow down", wait as long as it asks.
 */
export const EMBED_BATCH_SIZE = 90;
export const EMBEDS_PER_MINUTE = 90;

/** Texts sent in the last 60 seconds, shared by every call in this process. */
export class SendWindow {
  private sent: { at: number; n: number }[] = [];

  /** Waits (if needed) until `n` more texts fit in the window, then records them. */
  async reserve(
    n: number,
    perMinute: number,
    now: () => number,
    sleep: (ms: number) => Promise<void>,
  ): Promise<void> {
    const t = now();
    this.sent = this.sent.filter((s) => s.at > t - 60_000);
    let used = this.sent.reduce((sum, s) => sum + s.n, 0);
    let wait = 0;
    // Free room by waiting for the oldest sends to leave the window. Computed
    // once (no polling loop), so a fake clock in tests can't make it spin.
    for (const s of this.sent) {
      if (used + n <= perMinute) break;
      used -= s.n;
      wait = s.at + 60_000 - t;
    }
    if (wait > 0) await sleep(wait + 250);
    this.sent.push({ at: Math.max(now(), t + wait), n });
  }
}

const sharedWindow = new SendWindow();

export interface EmbedOpts {
  model?: EmbeddingModel<string>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  batchSize?: number;
  /** Most texts sent in any 60-second window. */
  perMinute?: number;
  /** null = don't pace (a live chat query is a single text). */
  window?: SendWindow | null;
  /** How many times a rate-limited batch is retried. */
  retries?: number;
  /** Longest wait accepted for one rate limit; a longer one throws instead. */
  maxWaitMs?: number;
}

type GeminiTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function l2Normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
  if (norm === 0) return vec;
  return vec.map((x) => x / norm);
}

/**
 * How long Gemini asked us to wait, in ms (+1s margin). Its 429 says
 * "Please retry in 55.138809785s" and carries `"retryDelay": "55s"`; the AI
 * SDK may wrap the original error in `lastError`. Defaults to a full minute.
 */
export function retryDelayMs(err: unknown): number {
  const texts: string[] = [];
  const collect = (e: unknown) => {
    if (typeof e !== "object" || e === null) return;
    const o = e as { message?: unknown; responseBody?: unknown; lastError?: unknown };
    if (typeof o.message === "string") texts.push(o.message);
    if (typeof o.responseBody === "string") texts.push(o.responseBody);
    if (o.lastError) collect(o.lastError);
  };
  collect(err);
  for (const text of texts) {
    const m = /retry in ([\d.]+)\s*s/i.exec(text) ?? /"retryDelay"\s*:\s*"([\d.]+)s"/i.exec(text);
    if (m) return Math.ceil(Number(m[1]) * 1000) + 1000;
  }
  return 60_000;
}

async function embedBatch(
  model: EmbeddingModel<string>,
  values: string[],
  taskType: GeminiTaskType,
  opts: Required<Pick<EmbedOpts, "sleep" | "retries" | "maxWaitMs">>,
): Promise<number[][]> {
  const call = () =>
    embedMany({
      model,
      values,
      maxRetries: 0, // we retry ourselves, with the delay Gemini asks for
      providerOptions: {
        google: { outputDimensionality: EMBEDDING_DIMS, taskType },
      },
    });
  let result;
  for (let attempt = 0; ; attempt++) {
    try {
      result = await call();
      break;
    } catch (err) {
      if (!isRateLimitError(err) || attempt >= opts.retries) throw err;
      const wait = retryDelayMs(err);
      if (wait > opts.maxWaitMs) throw err;
      await opts.sleep(wait);
    }
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
  defaults: { retries: number; maxWaitMs: number; window: SendWindow | null },
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const model = opts.model ?? embeddingModel();
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const batchSize = opts.batchSize ?? EMBED_BATCH_SIZE;
  const perMinute = opts.perMinute ?? EMBEDS_PER_MINUTE;
  const window = opts.window === undefined ? defaults.window : opts.window;
  const retry = {
    sleep,
    retries: opts.retries ?? defaults.retries,
    maxWaitMs: opts.maxWaitMs ?? defaults.maxWaitMs,
  };

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    if (window) await window.reserve(batch.length, perMinute, now, sleep);
    out.push(...(await embedBatch(model, batch, taskType, retry)));
  }
  return out;
}

/** Crawls and uploads: paced, and patient with rate limits (a background job can wait). */
export function embedTexts(texts: string[], opts: EmbedOpts = {}): Promise<number[][]> {
  return embed(texts, "RETRIEVAL_DOCUMENT", opts, { retries: 4, maxWaitMs: 90_000, window: sharedWindow });
}

/** A visitor's question: one quick retry at most, so the chat never hangs for a minute. */
export async function embedQuery(text: string, opts: EmbedOpts = {}): Promise<number[]> {
  const [vec] = await embed([text], "RETRIEVAL_QUERY", opts, { retries: 1, maxWaitMs: 8_000, window: null });
  return vec;
}
