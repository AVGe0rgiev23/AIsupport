import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, "required"),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1, "required"),
  GROQ_API_KEY: z.string().min(1, "required"),
  LLM_PROVIDER: z.enum(["google", "groq"]).default("google"),
  // Combined per-org daily counter across both providers. Deliberately low:
  // GOOGLE_GENERATIVE_AI_API_KEY / GROQ_API_KEY are single GLOBAL keys shared
  // by every tenant on a free tier of roughly 250-1000 requests/day for the
  // whole key, and each visitor message now records TWO units (the Gemini
  // embedding for retrieval plus the chat completion — see /api/chat). 50
  // units is ~25 visitor messages per org per day, so even the 250/day floor
  // survives several tenants instead of being drained by one.
  WIDGET_DAILY_MSG_CAP: z.coerce.number().int().positive().default(50),
  // Coarse per-caller throttle (see src/lib/chat/rateLimit.ts). Far above any
  // human typing rate; it exists to blunt scripted floods, not to shape UX.
  WIDGET_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(20),
  WIDGET_TOKEN_SECRET: z.string().min(32, "must be at least 32 characters"),
  RESEND_API_KEY: z.string().min(1, "required"),
  AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  TRIGGER_SECRET_KEY: z.string().min(1, "required"),
  BLOB_READ_WRITE_TOKEN: z.string().min(1, "required"),
  APP_URL: z.string().url().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    throw new Error(`Invalid environment: ${details}`);
  }
  return result.data;
}

export function env(): Env {
  cached ??= loadEnv();
  return cached;
}
