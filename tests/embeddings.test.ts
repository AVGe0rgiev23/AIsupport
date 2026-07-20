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
