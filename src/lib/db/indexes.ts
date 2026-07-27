import type { Db } from "mongodb";

export async function ensureIndexes(db: Db): Promise<void> {
  await db.collection("organizations").createIndex({ slug: 1 }, { unique: true });
  await db.collection("memberships").createIndex({ userId: 1, orgId: 1 }, { unique: true });
  await db.collection("memberships").createIndex({ orgId: 1 });
  await db.collection("sources").createIndex({ orgId: 1, status: 1 });
  await db.collection("documents").createIndex({ orgId: 1, sourceId: 1 });
  await db.collection("chunks").createIndex({ orgId: 1, documentId: 1 });
  await db.collection("kbArticles").createIndex({ orgId: 1, status: 1 });
  await db.collection("conversations").createIndex({ orgId: 1, status: 1, updatedAt: -1 });
  await db.collection("messages").createIndex({ orgId: 1, conversationId: 1, createdAt: 1 });
  // createIndex only ADDS — the superseded index would otherwise linger in the
  // already-deployed Atlas cluster (M0 has a hard index budget). Tolerate its
  // absence on a fresh database.
  await db
    .collection("messages")
    .dropIndex("conversationId_1_createdAt_1")
    .catch(() => {});
  await db.collection("tickets").createIndex({ orgId: 1, status: 1, createdAt: -1 });
  await db.collection("apiKeys").createIndex({ hashedKey: 1 }, { unique: true });
  await db.collection("apiKeys").createIndex({ orgId: 1 });
  await db.collection("llmUsage").createIndex({ orgId: 1, date: 1, provider: 1 }, { unique: true });
}
