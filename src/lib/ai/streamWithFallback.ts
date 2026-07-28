import { streamText, type LanguageModel, type ModelMessage, type StreamTextResult, type ToolSet } from "ai";
import { isRateLimitError } from "@/lib/ai/provider";

type ChatStreamResult = StreamTextResult<ToolSet, never>;

export interface NamedModel {
  name: string; // e.g. "google" | "groq" — used only to tag onFinish/the result, not for model selection
  model: LanguageModel;
}

export interface StreamWithFallbackOpts {
  primary: NamedModel;
  fallback: NamedModel;
  system: string;
  messages: ModelMessage[];
  tools: ToolSet;
  onFinish?: (
    event: { text: string; usage: { inputTokens?: number; outputTokens?: number } },
    providerName: string,
  ) => void | Promise<void>;
  /** Injectable for tests — defaults to the real `streamText`. */
  streamTextFn?: (args: {
    model: LanguageModel;
    system: string;
    messages: ModelMessage[];
    tools: ToolSet;
    maxRetries: number;
    onFinish?: (event: any) => void | Promise<void>;
  }) => ChatStreamResult;
}

export type StreamWithFallbackResult =
  | { ok: true; result: ChatStreamResult; providerName: string }
  | { ok: false };

async function firstMeaningfulPart(result: ChatStreamResult) {
  for await (const part of result.fullStream) {
    if ((part as { type: string }).type === "start") continue;
    return part as { type: string; error?: unknown };
  }
  return undefined;
}

export async function streamWithFallback(
  opts: StreamWithFallbackOpts,
): Promise<StreamWithFallbackResult> {
  const call = opts.streamTextFn ?? (streamText as unknown as NonNullable<StreamWithFallbackOpts["streamTextFn"]>);

  // A discarded (rate-limited) call still finishes its own stream and would
  // otherwise fire onFinish — persisting an empty assistant message and
  // double-counting usage. Each call gets a guard its own onFinish checks.
  // maxRetries 0 on the PRIMARY only: surface its 429 immediately so we can
  // fail over fast. The fallback keeps the SDK's default retries — it's the
  // last resort, and treating one transient blip there as "both exhausted"
  // would escalate a visitor to a human that a retry would have served.
  const run = (named: NamedModel, maxRetries: number) => {
    const guard = { discarded: false };
    const result = call({
      model: named.model,
      system: opts.system,
      messages: opts.messages,
      tools: opts.tools,
      maxRetries,
      onFinish: opts.onFinish
        ? (event: any) => {
            if (guard.discarded) return;
            return opts.onFinish!(event, named.name);
          }
        : undefined,
    });
    return { result, guard };
  };

  const primary = run(opts.primary, 0);
  const part = await firstMeaningfulPart(primary.result);

  if (part?.type === "error" && isRateLimitError(part.error)) {
    primary.guard.discarded = true;
    const fallback = run(opts.fallback, 2); // SDK default — see comment above
    const fallbackPart = await firstMeaningfulPart(fallback.result);
    if (fallbackPart?.type === "error" && isRateLimitError(fallbackPart.error)) {
      fallback.guard.discarded = true;
      return { ok: false };
    }
    return { ok: true, result: fallback.result, providerName: opts.fallback.name };
  }

  return { ok: true, result: primary.result, providerName: opts.primary.name };
}
