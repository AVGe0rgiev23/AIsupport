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

type FinishEvent = { text: string; usage: { inputTokens?: number; outputTokens?: number } };

// A discarded (rate-limited) call still finishes its own stream and would
// otherwise fire onFinish — persisting an empty assistant message and
// double-counting usage. The naive fix — a boolean flag flipped to
// "discarded" only once we've inspected the first part — has a real race:
// in the installed ai@5.0.216, onFinish fires from the stream's internal
// flush(), which runs when the stream closes, NOT when our reader drains
// it. A rate-limited stream closes almost immediately, so its onFinish can
// fire (as a microtask) before the continuation that would have flagged it
// discarded ever runs — the flag flip loses the race and the empty message
// leaks through.
//
// The fix: a call is "committed" only once we explicitly decide to use its
// result. Until then, any onFinish event is stashed, never forwarded. We
// commit exactly the one call we return — never a discarded call, and
// nothing at all on the both-exhausted path — and committing replays a
// stashed event (if one arrived early) or lets a later one flow straight
// through (the ordinary case, since the caller keeps draining the full
// stream well after we've returned).
interface CallGuard {
  committed: boolean;
  pending: FinishEvent | null;
}

export async function streamWithFallback(
  opts: StreamWithFallbackOpts,
): Promise<StreamWithFallbackResult> {
  const call = opts.streamTextFn ?? (streamText as unknown as NonNullable<StreamWithFallbackOpts["streamTextFn"]>);

  // maxRetries 0 on the PRIMARY only: surface its 429 immediately so we can
  // fail over fast. The fallback keeps the SDK's default retries — it's the
  // last resort, and treating one transient blip there as "both exhausted"
  // would escalate a visitor to a human that a retry would have served.
  const run = (named: NamedModel, maxRetries: number) => {
    const guard: CallGuard = { committed: false, pending: null };
    const result = call({
      model: named.model,
      system: opts.system,
      messages: opts.messages,
      tools: opts.tools,
      maxRetries,
      onFinish: opts.onFinish
        ? (event: any) => {
            if (guard.committed) {
              return opts.onFinish!(event, named.name);
            }
            // Not committed yet (or never will be, if this call ends up
            // discarded) — stash it. A discarded call's stash is simply
            // never replayed.
            guard.pending = event;
            return undefined;
          }
        : undefined,
    });
    return { result, guard };
  };

  // Marks `guard` as the winner. If its onFinish already fired early (and
  // stashed an event), replay that event now — awaited, so the caller's
  // async onFinish (e.g. a DB write) is never dropped. Never call this for
  // a call we're discarding.
  const commit = async (guard: CallGuard, named: NamedModel) => {
    guard.committed = true;
    if (guard.pending !== null) {
      const event = guard.pending;
      guard.pending = null;
      if (opts.onFinish) await opts.onFinish(event, named.name);
    }
  };

  const primary = run(opts.primary, 0);
  const part = await firstMeaningfulPart(primary.result);

  if (part?.type === "error" && isRateLimitError(part.error)) {
    // primary is discarded: deliberately never committed, so any onFinish
    // event it produces — early or late — stays stashed forever.
    const fallback = run(opts.fallback, 2); // SDK default — see comment above
    const fallbackPart = await firstMeaningfulPart(fallback.result);
    if (fallbackPart?.type === "error" && isRateLimitError(fallbackPart.error)) {
      // both exhausted — commit nothing.
      return { ok: false };
    }
    await commit(fallback.guard, opts.fallback);
    return { ok: true, result: fallback.result, providerName: opts.fallback.name };
  }

  await commit(primary.guard, opts.primary);
  return { ok: true, result: primary.result, providerName: opts.primary.name };
}
