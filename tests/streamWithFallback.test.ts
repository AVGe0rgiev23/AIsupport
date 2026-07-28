import { describe, expect, it } from "vitest";
import { streamWithFallback } from "@/lib/ai/streamWithFallback";

function fakeStream(parts: unknown[]) {
  return {
    fullStream: (async function* () {
      for (const p of parts) yield p;
    })(),
    toUIMessageStream: () => ({}) as unknown,
  };
}

const START = { type: "start" };
const rateLimitError = () => Object.assign(new Error("rate limited"), { statusCode: 429 });

describe("streamWithFallback", () => {
  it("returns the primary stream when it starts fine", async () => {
    const calls: string[] = [];
    const streamTextFn = ({ model }: any) => {
      calls.push(model.tag);
      return fakeStream([START, { type: "text-delta", text: "hi" }]);
    };
    const res = await streamWithFallback({
      primary: { name: "google", model: { tag: "google" } as any },
      fallback: { name: "groq", model: { tag: "groq" } as any },
      system: "sys",
      messages: [],
      tools: {},
      streamTextFn: streamTextFn as any,
    });
    expect(calls).toEqual(["google"]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.providerName).toBe("google");
  });

  it("falls back and reports the fallback's provider name", async () => {
    const calls: string[] = [];
    const streamTextFn = ({ model }: any) => {
      calls.push(model.tag);
      return model.tag === "google"
        ? fakeStream([START, { type: "error", error: rateLimitError() }])
        : fakeStream([START, { type: "text-delta", text: "hi" }]);
    };
    const res = await streamWithFallback({
      primary: { name: "google", model: { tag: "google" } as any },
      fallback: { name: "groq", model: { tag: "groq" } as any },
      system: "sys",
      messages: [],
      tools: {},
      streamTextFn: streamTextFn as any,
    });
    expect(calls).toEqual(["google", "groq"]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.providerName).toBe("groq");
  });

  it("reports failure when both providers rate-limit on their first meaningful part", async () => {
    const streamTextFn = () => fakeStream([START, { type: "error", error: rateLimitError() }]);
    const res = await streamWithFallback({
      primary: { name: "google", model: {} as any },
      fallback: { name: "groq", model: {} as any },
      system: "sys",
      messages: [],
      tools: {},
      streamTextFn: streamTextFn as any,
    });
    expect(res.ok).toBe(false);
  });

  it("does not fall back on a non-rate-limit error", async () => {
    const calls: string[] = [];
    const streamTextFn = ({ model }: any) => {
      calls.push(model.tag);
      return fakeStream([START, { type: "error", error: new Error("bad request") }]);
    };
    const res = await streamWithFallback({
      primary: { name: "google", model: { tag: "google" } as any },
      fallback: { name: "groq", model: { tag: "groq" } as any },
      system: "sys",
      messages: [],
      tools: {},
      streamTextFn: streamTextFn as any,
    });
    expect(calls).toEqual(["google"]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.providerName).toBe("google");
  });

  it("passes onFinish through to the winning call, tagged with its provider name", async () => {
    const seen: Array<{ text: string; provider: string }> = [];
    const streamTextFn = ({ onFinish }: any) => {
      onFinish?.({ text: "answer", usage: { inputTokens: 1, outputTokens: 2 } });
      return fakeStream([START, { type: "text-delta", text: "answer" }]);
    };
    await streamWithFallback({
      primary: { name: "google", model: {} as any },
      fallback: { name: "groq", model: {} as any },
      system: "sys",
      messages: [],
      tools: {},
      onFinish: (event, provider) => {
        seen.push({ text: event.text, provider });
      },
      streamTextFn: streamTextFn as any,
    });
    expect(seen).toEqual([{ text: "answer", provider: "google" }]);
  });

  it("never fires onFinish for a discarded rate-limited call", async () => {
    // A rate-limited primary still finishes its own stream. If its onFinish
    // fired, the route would persist an empty assistant message and
    // double-count usage against the daily cap.
    const seen: string[] = [];
    const finishers: Array<() => void> = [];
    const streamTextFn = ({ model, onFinish }: any) => {
      finishers.push(() => onFinish?.({ text: model.tag === "google" ? "" : "real answer", usage: {} }));
      return model.tag === "google"
        ? fakeStream([START, { type: "error", error: rateLimitError() }])
        : fakeStream([START, { type: "text-delta", text: "real answer" }]);
    };
    await streamWithFallback({
      primary: { name: "google", model: { tag: "google" } as any },
      fallback: { name: "groq", model: { tag: "groq" } as any },
      system: "sys",
      messages: [],
      tools: {},
      onFinish: (event, provider) => {
        seen.push(`${provider}:${event.text}`);
      },
      streamTextFn: streamTextFn as any,
    });
    // Both underlying calls settle their streams; only the winner may report.
    finishers.forEach((f) => f());
    expect(seen).toEqual(["groq:real answer"]);
  });
});
