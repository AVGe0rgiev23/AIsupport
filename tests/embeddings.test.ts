import type { EmbeddingModel } from "ai";
import { describe, expect, it, vi } from "vitest";
import { embedQuery, embedTexts, EMBEDDING_DIMS, retryDelayMs, SendWindow } from "@/lib/ai/embeddings";

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
  it("sends at most 90 texts in any minute (Gemini free tier allows 100)", async () => {
    const calls: string[][] = [];
    let clock = 0;
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });
    const texts = Array.from({ length: 250 }, (_, i) => `t${i}`);
    const out = await embedTexts(texts, { model: fakeModel(calls), sleep, now: () => clock, window: new SendWindow() });
    expect(out).toHaveLength(250);
    expect(calls.map((c) => c.length)).toEqual([90, 90, 70]);
    expect(sleep).toHaveBeenCalledTimes(2); // waits for the window twice, never after the last batch
    expect(clock).toBeGreaterThanOrEqual(120_000);
  });

  it("paces across separate calls too (one call per crawled page)", async () => {
    const calls: string[][] = [];
    let clock = 0;
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });
    const window = new SendWindow();
    for (let page = 0; page < 4; page++) {
      await embedTexts(Array.from({ length: 30 }, (_, i) => `p${page}-${i}`), { model: fakeModel(calls), sleep, now: () => clock, window });
    }
    expect(sleep).toHaveBeenCalledTimes(1); // pages 1-3 fit in the first minute, page 4 waits
    expect(clock).toBeGreaterThanOrEqual(60_000);
  });

  it("L2-normalizes every vector", async () => {
    const calls: string[][] = [];
    const [vec] = await embedTexts(["hello"], { model: fakeModel(calls), sleep: noSleep });
    expect(vec).toHaveLength(EMBEDDING_DIMS);
    const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 6);
  });

  it("waits as long as Gemini asks after a rate limit, then retries", async () => {
    const calls: string[][] = [];
    const sleep = vi.fn(noSleep);
    const geminiError = { statusCode: 429, message: "You exceeded your current quota ... Please retry in 55.138809785s." };
    const out = await embedTexts(["a", "b"], { model: fakeModel(calls, geminiError), sleep, window: null });
    expect(out).toHaveLength(2);
    expect(sleep).toHaveBeenCalledWith(56_139); // 55.14s, plus a second
  });

  it("waits a full minute when the rate limit doesn't say how long", async () => {
    const calls: string[][] = [];
    const sleep = vi.fn(noSleep);
    await embedTexts(["a"], { model: fakeModel(calls, { statusCode: 429 }), sleep, window: null });
    expect(sleep).toHaveBeenCalledWith(60_000);
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

  it("doesn't make a visitor wait a minute: a long rate limit fails fast", async () => {
    const calls: string[][] = [];
    const sleep = vi.fn(noSleep);
    const err = { statusCode: 429, message: "Please retry in 40s" };
    await expect(embedQuery("Какво работно време имате?", { model: fakeModel(calls, err), sleep })).rejects.toMatchObject({ statusCode: 429 });
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("retryDelayMs", () => {
  it("reads Gemini's delay from the message, the response body or a wrapped error", () => {
    expect(retryDelayMs({ message: "Please retry in 55.138809785s." })).toBe(56_139);
    expect(retryDelayMs({ responseBody: '{"retryDelay": "12s"}' })).toBe(13_000);
    expect(retryDelayMs({ lastError: { message: "retry in 3s" } })).toBe(4_000);
    expect(retryDelayMs(new Error("nope"))).toBe(60_000);
  });
});
