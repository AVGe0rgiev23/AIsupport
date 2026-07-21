import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, "required"),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1, "required"),
  GROQ_API_KEY: z.string().min(1, "required"),
  LLM_PROVIDER: z.enum(["google", "groq"]).default("google"),
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
