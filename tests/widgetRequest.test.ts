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

function post(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/chat", { method: "POST", headers });
}

// A cross-site page can POST JSON-looking bodies as a CORS *simple* request
// (Content-Type: text/plain, no preflight, response unreadable but the write
// still happens). Request.json() parses those regardless of Content-Type, so
// the only thing that distinguishes them is the browser-set Origin header.
describe("isSameSiteRequest", () => {
  it("allows a request with no Origin header at all", async () => {
    const { isSameSiteRequest } = await import("@/lib/chat/widgetRequest");
    expect(isSameSiteRequest(post(), "http://localhost:3000")).toBe(true);
  });

  it("allows a matching Origin", async () => {
    const { isSameSiteRequest } = await import("@/lib/chat/widgetRequest");
    expect(
      isSameSiteRequest(post({ origin: "http://localhost:3000" }), "http://localhost:3000"),
    ).toBe(true);
  });

  it("rejects a mismatched Origin", async () => {
    const { isSameSiteRequest } = await import("@/lib/chat/widgetRequest");
    expect(isSameSiteRequest(post({ origin: "https://evil.com" }), "http://localhost:3000")).toBe(
      false,
    );
    // Scheme and port are part of an origin.
    expect(
      isSameSiteRequest(post({ origin: "https://localhost:3000" }), "http://localhost:3000"),
    ).toBe(false);
    expect(
      isSameSiteRequest(post({ origin: "http://localhost:3001" }), "http://localhost:3000"),
    ).toBe(false);
  });

  it("rejects the opaque `null` Origin browsers send from sandboxed/data contexts", async () => {
    const { isSameSiteRequest } = await import("@/lib/chat/widgetRequest");
    expect(isSameSiteRequest(post({ origin: "null" }), "http://localhost:3000")).toBe(false);
  });

  it("compares origins, not raw APP_URL strings (path and trailing slash are irrelevant)", async () => {
    const { isSameSiteRequest } = await import("@/lib/chat/widgetRequest");
    expect(
      isSameSiteRequest(post({ origin: "https://app.example.com" }), "https://app.example.com/"),
    ).toBe(true);
  });

  it("defaults its expected origin to APP_URL", async () => {
    const { isSameSiteRequest } = await import("@/lib/chat/widgetRequest");
    // APP_URL defaults to http://localhost:3000 (see src/lib/env.ts).
    expect(isSameSiteRequest(post({ origin: "http://localhost:3000" }))).toBe(true);
    expect(isSameSiteRequest(post({ origin: "https://evil.com" }))).toBe(false);
  });
});

describe("authorizeWidgetRequest", () => {
  it("returns the payload and a constructed orgId for a valid same-origin request", async () => {
    const { mintWidgetToken } = await import("@/lib/widgetToken");
    const { authorizeWidgetRequest } = await import("@/lib/chat/widgetRequest");
    const orgId = new ObjectId();
    const token = mintWidgetToken(orgId, "http://localhost:3000");
    const result = authorizeWidgetRequest(post({ origin: "http://localhost:3000" }), token);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.orgId.equals(orgId)).toBe(true);
    expect(result.payload.verifiedOrigin).toBe("http://localhost:3000");
  });

  it("rejects a cross-site request with 403 before even looking at the token", async () => {
    const { mintWidgetToken } = await import("@/lib/widgetToken");
    const { authorizeWidgetRequest } = await import("@/lib/chat/widgetRequest");
    const token = mintWidgetToken(new ObjectId(), "https://acme.com");
    const result = authorizeWidgetRequest(post({ origin: "https://evil.com" }), token);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.response.status).toBe(403);
  });

  it("rejects an invalid or expired token with 401", async () => {
    const { mintWidgetToken } = await import("@/lib/widgetToken");
    const { authorizeWidgetRequest } = await import("@/lib/chat/widgetRequest");
    const bad = authorizeWidgetRequest(post(), "not-a-token");
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error("unreachable");
    expect(bad.response.status).toBe(401);

    const expired = authorizeWidgetRequest(post(), mintWidgetToken(new ObjectId(), "o", -1));
    expect(expired.ok).toBe(false);
  });

  // isWidgetTokenPayload only guarantees orgId is a *string*. Constructing an
  // ObjectId from it is the last "throwable outside the guard" in the chat
  // routes; doing it here, behind isValid, makes the helper total.
  it("rejects a signed token whose orgId is not a valid ObjectId, without throwing", async () => {
    const { createHmac } = await import("crypto");
    const { authorizeWidgetRequest } = await import("@/lib/chat/widgetRequest");
    const body = Buffer.from(
      JSON.stringify({ orgId: "not-hex", verifiedOrigin: "o", exp: Date.now() + 60_000 }),
    ).toString("base64url");
    const sig = createHmac("sha256", process.env.WIDGET_TOKEN_SECRET!).update(body).digest("hex");

    const result = authorizeWidgetRequest(post(), `${body}.${sig}`);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.response.status).toBe(401);
  });
});

describe("normalizeEscalationReason", () => {
  it("passes through every known reason", async () => {
    const { ESCALATION_REASONS, normalizeEscalationReason } = await import(
      "@/lib/chat/widgetRequest"
    );
    expect([...ESCALATION_REASONS]).toEqual([
      "model_requested",
      "quota",
      "error",
      "user_requested",
      "provider_exhausted",
    ]);
    for (const reason of ESCALATION_REASONS) {
      expect(normalizeEscalationReason(reason)).toBe(reason);
    }
  });

  // reason lands in Ticket.notes verbatim: unconstrained, it is an
  // unauthenticated free-text write of arbitrary length.
  it("collapses anything unknown to user_requested", async () => {
    const { normalizeEscalationReason } = await import("@/lib/chat/widgetRequest");
    expect(normalizeEscalationReason("x".repeat(100_000))).toBe("user_requested");
    expect(normalizeEscalationReason("MODEL_REQUESTED")).toBe("user_requested");
    expect(normalizeEscalationReason(undefined)).toBe("user_requested");
    expect(normalizeEscalationReason(null)).toBe("user_requested");
    expect(normalizeEscalationReason(42)).toBe("user_requested");
    expect(normalizeEscalationReason({ toString: () => "quota" })).toBe("user_requested");
  });
});

describe("capVisitorText", () => {
  it("shares one length cap with /api/chat's message limit", async () => {
    const { MAX_VISITOR_TEXT_LENGTH, capVisitorText } = await import("@/lib/chat/widgetRequest");
    expect(MAX_VISITOR_TEXT_LENGTH).toBe(4000);
    expect(capVisitorText("hello")).toBe("hello");
    expect(capVisitorText("x".repeat(5000))).toHaveLength(MAX_VISITOR_TEXT_LENGTH);
  });

  it("coerces non-strings to empty rather than stringifying them", async () => {
    const { capVisitorText } = await import("@/lib/chat/widgetRequest");
    expect(capVisitorText(undefined)).toBe("");
    expect(capVisitorText(null)).toBe("");
    expect(capVisitorText(["a", "b"])).toBe("");
    expect(capVisitorText({ toString: () => "pwned" })).toBe("");
    expect(capVisitorText(1234)).toBe("");
  });
});
