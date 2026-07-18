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

export interface Source {
  _id: ObjectId;
  orgId: ObjectId;
  type: "file" | "url" | "crawl" | "ticket-import";
  name: string;
  status: "pending" | "processing" | "ready" | "error";
  lastSyncedAt: Date | null;
  crawlSchedule: string | null; // cron expression, crawl sources only
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
