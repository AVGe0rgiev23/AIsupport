import { describe, expect, it } from "vitest";
import { loadEnv } from "@/lib/env";

const valid = {
  MONGODB_URI: "mongodb+srv://user:pass@cluster.example.mongodb.net/supportai",
  GOOGLE_GENERATIVE_AI_API_KEY: "test-google-key",
  GROQ_API_KEY: "test-groq-key",
  RESEND_API_KEY: "re_test",
  AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  TRIGGER_SECRET_KEY: "tr_dev_test",
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

  it("rejects an unknown LLM_PROVIDER", () => {
    expect(() =>
      loadEnv({ ...valid, LLM_PROVIDER: "openai" } as unknown as NodeJS.ProcessEnv),
    ).toThrowError(/LLM_PROVIDER/);
  });
});
