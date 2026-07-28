import { ObjectId } from "mongodb";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.MONGODB_URI = "mongodb://localhost:27017/test";
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-google";
  process.env.GROQ_API_KEY = "test-groq";
  process.env.RESEND_API_KEY = "re_test";
  process.env.AUTH_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.TRIGGER_SECRET_KEY = "tr_dev_test";
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
  process.env.WIDGET_TOKEN_SECRET = "widget-token-secret-at-least-32-chars-long";
});

describe("mintWidgetToken / verifyWidgetToken", () => {
  it("round-trips a valid token", async () => {
    const { mintWidgetToken, verifyWidgetToken } = await import("@/lib/widgetToken");
    const orgId = new ObjectId();
    const token = mintWidgetToken(orgId, "https://acme.com");
    const payload = verifyWidgetToken(token);
    expect(payload?.orgId).toBe(orgId.toString());
    expect(payload?.verifiedOrigin).toBe("https://acme.com");
  });

  it("rejects a tampered payload", async () => {
    const { mintWidgetToken, verifyWidgetToken } = await import("@/lib/widgetToken");
    const token = mintWidgetToken(new ObjectId(), "https://acme.com");
    const [body, sig] = token.split(".");
    const tamperedBody = Buffer.from(
      JSON.stringify({ orgId: "000000000000000000000000", verifiedOrigin: "https://evil.com", exp: Date.now() + 999_999 }),
    ).toString("base64url");
    expect(verifyWidgetToken(`${tamperedBody}.${sig}`)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { mintWidgetToken, verifyWidgetToken } = await import("@/lib/widgetToken");
    const token = mintWidgetToken(new ObjectId(), "https://acme.com", -1);
    expect(verifyWidgetToken(token)).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    const { verifyWidgetToken } = await import("@/lib/widgetToken");
    expect(verifyWidgetToken("not-a-token")).toBeNull();
    expect(verifyWidgetToken("")).toBeNull();
  });
});
