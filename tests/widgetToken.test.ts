import { createHmac } from "crypto";
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

    // Well-formed two-part token, but the signature is valid-length garbage:
    // exercises the timing-safe comparison path (not just the ".".split guard).
    const body = Buffer.from(
      JSON.stringify({ orgId: "x", verifiedOrigin: "y", exp: Date.now() + 1000 }),
    ).toString("base64url");
    const garbageSig = "0".repeat(64);
    expect(verifyWidgetToken(`${body}.${garbageSig}`)).toBeNull();

    // Body decodes to the JSON literal `null` (JSON.parse("null") succeeds and
    // returns null without throwing) — signed correctly so it reaches the
    // post-signature-check payload-shape guard instead of being rejected earlier.
    const secret = process.env.WIDGET_TOKEN_SECRET!;
    const nullBody = Buffer.from("null").toString("base64url");
    const nullSig = createHmac("sha256", secret).update(nullBody).digest("hex");
    expect(verifyWidgetToken(`${nullBody}.${nullSig}`)).toBeNull();

    // Body is valid, correctly-signed JSON but missing `exp` entirely.
    const noExpBody = Buffer.from(JSON.stringify({ orgId: "x", verifiedOrigin: "y" })).toString(
      "base64url",
    );
    const noExpSig = createHmac("sha256", secret).update(noExpBody).digest("hex");
    expect(verifyWidgetToken(`${noExpBody}.${noExpSig}`)).toBeNull();
  });
});
