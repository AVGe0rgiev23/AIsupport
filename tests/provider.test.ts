import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.MONGODB_URI = "mongodb://localhost:27017/test";
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-google";
  process.env.GROQ_API_KEY = "test-groq";
  process.env.RESEND_API_KEY = "re_test";
  process.env.AUTH_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.TRIGGER_SECRET_KEY = "tr_dev_test";
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
  process.env.LLM_PROVIDER = "google";
});

describe("chatModel", () => {
  it("returns the Gemini model by default", async () => {
    const { chatModel } = await import("@/lib/ai/provider");
    const model = chatModel() as unknown as { modelId: string };
    expect(model.modelId).toBe("gemini-3.5-flash");
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
