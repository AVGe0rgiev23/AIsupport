import type { ObjectId } from "mongodb";

export type Role = "owner" | "admin" | "agent";
export type ProviderName = "google" | "groq";

export interface Organization {
  _id: ObjectId;
  name: string;
  slug: string;
  widgetConfig: {
    primaryColor: string;
    greeting: string;
    position: "bottom-right" | "bottom-left";
  };
  emailConfig: {
    supportAddress: string | null;
    mode: "draft" | "auto-send";
  };
  aiConfig: {
    tone: string;
    escalationRules: string;
    provider: ProviderName | null; // null = use global LLM_PROVIDER
  };
  createdAt: Date;
}

export interface Membership {
  _id: ObjectId;
  userId: ObjectId; // Auth.js users._id
  orgId: ObjectId;
  role: Role;
  createdAt: Date;
}

export type SourceConfig =
  | { kind: "file"; blobUrl: string; filename: string; contentType: string }
  | { kind: "crawl"; rootUrl: string; maxPages: number; maxDepth: number }
  | { kind: "ticket-import"; blobUrl: string; filename: string; format: "csv" | "mbox" };

export interface Source {
  _id: ObjectId;
  orgId: ObjectId;
  type: "file" | "url" | "crawl" | "ticket-import";
  name: string;
  status: "pending" | "processing" | "ready" | "error";
  config: SourceConfig;
  lastRunId: string | null; // Trigger.dev run id of the latest ingestion run
  errorMessage: string | null;
  chunkCount: number;
  lastSyncedAt: Date | null;
  crawlSchedule: "daily" | "weekly" | null; // crawl sources only
  createdAt: Date;
}

export interface KbDocument {
  _id: ObjectId;
  orgId: ObjectId;
  sourceId: ObjectId;
  title: string;
  rawText: string;
  meta: Record<string, unknown>; // url, filename, contentHash, ...
  createdAt: Date;
}

export interface Chunk {
  _id: ObjectId;
  orgId: ObjectId;
  documentId: ObjectId;
  text: string;
  embedding: number[]; // 768 dims — locked (see Global Constraints)
  heading: string | null;
  position: number;
}

export interface KbArticle {
  _id: ObjectId;
  orgId: ObjectId;
  title: string;
  body: string; // markdown
  tags: string[];
  status: "ai-draft" | "published" | "archived";
  generatedFrom: {
    conversationId?: ObjectId;
    documentIds?: ObjectId[];
  } | null;
  approvedBy: ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  _id: ObjectId;
  orgId: ObjectId;
  channel: "widget" | "email";
  visitor: { email: string | null; name: string | null; pageUrl: string | null };
  status: "open" | "resolved" | "escalated";
  resolution: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  _id: ObjectId;
  orgId: ObjectId;
  conversationId: ObjectId;
  role: "user" | "assistant" | "system";
  content: string;
  citations: { chunkId: ObjectId; documentId: ObjectId }[];
  usage: { provider: string; inputTokens: number; outputTokens: number } | null;
  createdAt: Date;
}

export interface Ticket {
  _id: ObjectId;
  orgId: ObjectId;
  conversationId: ObjectId | null;
  visitorEmail: string;
  question: string;
  status: "open" | "answered" | "closed";
  assignee: ObjectId | null;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKey {
  _id: ObjectId;
  orgId: ObjectId;
  hashedKey: string; // sha256 hex of the public site key
  label: string;
  allowedDomains: string[]; // hostnames; subdomains implicitly allowed
  createdAt: Date;
}

export interface LlmUsage {
  _id: ObjectId;
  orgId: ObjectId;
  date: string; // YYYY-MM-DD (UTC)
  provider: string;
  requests: number;
  tokens: number;
}

/** Coarse per-caller throttle counter for the anonymous widget endpoints.
 *  Same Mongo counter shape as LlmUsage — no new service (see the $0/month
 *  budget constraint). `bucket` is a hashed, deliberately BOUNDED projection
 *  of the caller (see src/lib/chat/rateLimit.ts) so the throttle store can
 *  never itself become an unbounded write target. */
export interface WidgetRateLimit {
  _id: ObjectId;
  orgId: ObjectId;
  bucket: string; // 2 hex chars — 256 buckets per org per window
  window: number; // floor(epochMs / RATE_LIMIT_WINDOW_MS)
  count: number;
  expiresAt: Date; // TTL-reaped
}
