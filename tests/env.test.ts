import { describe, expect, it } from "vitest";
import { loadEnv } from "@/lib/env";

const valid = {
  MONGODB_URI: "mongodb+srv://user:pass@cluster.example.mongodb.net/supportai",
  GOOGLE_GENERATIVE_AI_API_KEY: "test-google-key",
  GROQ_API_KEY: "test-groq-key",
  RESEND_API_KEY: "re_test",
  AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  TRIGGER_SECRET_KEY: "tr_dev_test",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test",
  WIDGET_TOKEN_SECRET: "widget-token-secret-at-least-32-chars-long",
};

describe("loadEnv", () => {
  it("throws naming every missing variable", () => {
    expect(() => loadEnv({} as unknown as NodeJS.ProcessEnv)).toThrowError(/MONGODB_URI/);
    expect(() => loadEnv({} as unknown as NodeJS.ProcessEnv)).toThrowError(/AUTH_SECRET/);
  });

  it("applies defaults for LLM_PROVIDER and APP_URL", () => {
    const env = loadEnv(valid as unknown as NodeJS.ProcessEnv);
    expect(env.LLM_PROVIDER).toBe("google");
    expect(env.APP_URL).toBe("http://localhost:3000");
  });

  // GOOGLE_GENERATIVE_AI_API_KEY / GROQ_API_KEY are single GLOBAL keys shared
  // by every tenant, and each visitor message now costs two recorded provider
  // calls (embedding + chat). 50 counter units ~= 25 messages/org/day, so the
  // ~250/day floor of the Gemini free tier survives several tenants.
  it("defaults WIDGET_DAILY_MSG_CAP to 50", () => {
    expect(loadEnv(valid as unknown as NodeJS.ProcessEnv).WIDGET_DAILY_MSG_CAP).toBe(50);
  });

  it("defaults WIDGET_RATE_LIMIT_PER_MIN and coerces both counters from strings", () => {
    const env = loadEnv(valid as unknown as NodeJS.ProcessEnv);
    expect(env.WIDGET_RATE_LIMIT_PER_MIN).toBe(20);

    const overridden = loadEnv({
      ...valid,
      WIDGET_DAILY_MSG_CAP: "10",
      WIDGET_RATE_LIMIT_PER_MIN: "3",
    } as unknown as NodeJS.ProcessEnv);
    expect(overridden.WIDGET_DAILY_MSG_CAP).toBe(10);
    expect(overridden.WIDGET_RATE_LIMIT_PER_MIN).toBe(3);
  });

  it("rejects a non-positive WIDGET_RATE_LIMIT_PER_MIN", () => {
    expect(() =>
      loadEnv({ ...valid, WIDGET_RATE_LIMIT_PER_MIN: "0" } as unknown as NodeJS.ProcessEnv),
    ).toThrowError(/WIDGET_RATE_LIMIT_PER_MIN/);
  });

  it("rejects an unknown LLM_PROVIDER", () => {
    expect(() =>
      loadEnv({ ...valid, LLM_PROVIDER: "openai" } as unknown as NodeJS.ProcessEnv),
    ).toThrowError(/LLM_PROVIDER/);
  });

  it("requires BLOB_READ_WRITE_TOKEN", () => {
    const { BLOB_READ_WRITE_TOKEN: _omitted, ...rest } = valid;
    expect(() => loadEnv(rest as unknown as NodeJS.ProcessEnv)).toThrowError(
      /BLOB_READ_WRITE_TOKEN/,
    );
  });
});
