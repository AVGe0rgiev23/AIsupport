import { createHmac, timingSafeEqual } from "crypto";
import type { ObjectId } from "mongodb";
import { env } from "@/lib/env";

export interface WidgetTokenPayload {
  orgId: string;
  verifiedOrigin: string;
  exp: number; // unix ms
}

function sign(body: string): string {
  return createHmac("sha256", env().WIDGET_TOKEN_SECRET).update(body).digest("hex");
}

export function mintWidgetToken(
  orgId: ObjectId,
  verifiedOrigin: string,
  ttlMs = 60 * 60 * 1000,
): string {
  const payload: WidgetTokenPayload = {
    orgId: orgId.toString(),
    verifiedOrigin,
    exp: Date.now() + ttlMs,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyWidgetToken(token: string): WidgetTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: WidgetTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
  return payload;
}
