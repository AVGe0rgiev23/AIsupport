import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import type { EmbeddingModel, LanguageModel } from "ai";
import { env } from "@/lib/env";

export type ProviderName = "google" | "groq";

export const CHAT_MODELS: Record<ProviderName, string> = {
  google: "gemini-3.5-flash",
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
