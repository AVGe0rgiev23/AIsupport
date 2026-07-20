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
