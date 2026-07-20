import { ObjectId } from "mongodb";
import { logger, metadata, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { embedTexts } from "@/lib/ai/embeddings";
import { extractPdfWithGemini } from "@/lib/ai/pdfExtract";
import { getDb } from "@/lib/db/client";
import { withOrg } from "@/lib/db/withOrg";
import { chunkText } from "@/lib/ingest/chunk";
import { extractFileText, looksScanned } from "@/lib/ingest/extract";
import { ingestion } from "./queues";

const payloadSchema = z.object({ orgId: z.string(), sourceId: z.string() });

async function markSourceError(payload: { orgId: string; sourceId: string }, message: string) {
  const db = await getDb();
  await withOrg(db, new ObjectId(payload.orgId)).updateOne(
    "sources",
    { _id: new ObjectId(payload.sourceId) },
    { $set: { status: "error", errorMessage: message } },
  );
}

export const ingestDocument = schemaTask({
  id: "ingest-document",
  schema: payloadSchema,
  queue: ingestion,
  maxDuration: 900, // big PDFs + paced embedding batches
  onFailure: async ({ payload, error }) => {
    await markSourceError(payload, error instanceof Error ? error.message : String(error));
  },
  run: async (payload) => {
    const orgId = new ObjectId(payload.orgId);
    const sourceId = new ObjectId(payload.sourceId);
    const db = await getDb();
    const orgDb = withOrg(db, orgId);

    const source = await orgDb.findOne("sources", { _id: sourceId });
    if (!source) throw new Error(`Source ${payload.sourceId} not found in org`);
    if (source.config.kind !== "file") throw new Error("ingest-document requires a file source");

    await orgDb.updateOne("sources", { _id: sourceId }, { $set: { status: "processing", errorMessage: null } });

    metadata.set("phase", "downloading");
    const res = await fetch(source.config.blobUrl);
    if (!res.ok) throw new Error(`Blob download failed: ${res.status}`);
    const data = new Uint8Array(await res.arrayBuffer());

    metadata.set("phase", "extracting");
    let extracted = await extractFileText({
      data,
      contentType: source.config.contentType,
      filename: source.config.filename,
    });
    if (looksScanned(extracted)) {
      logger.info("scanned pdf detected — falling back to gemini transcription");
      const text = await extractPdfWithGemini(data);
      extracted = { ...extracted, text };
    }
    if (!extracted.text) throw new Error("No text could be extracted from the file");

    metadata.set("phase", "chunking");
    const chunks = chunkText(extracted.text);
    metadata.set("totalChunks", chunks.length).set("embeddedChunks", 0);

    metadata.set("phase", "embedding");
    const embeddings: number[][] = [];
    const BATCH = 100;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH);
      embeddings.push(...(await embedTexts(slice.map((c) => c.text))));
      metadata.set("embeddedChunks", Math.min(i + BATCH, chunks.length));
    }

    metadata.set("phase", "saving");
    // Re-ingesting a file source replaces its previous document + chunks.
    const oldDocs = await orgDb.find("documents", { sourceId }).toArray();
    if (oldDocs.length > 0) {
      const oldIds = oldDocs.map((d) => d._id);
      await orgDb.deleteMany("chunks", { documentId: { $in: oldIds } });
      await orgDb.deleteMany("documents", { sourceId });
    }

    const documentId = new ObjectId();
    await db.collection("documents").insertOne({
      _id: documentId,
      orgId,
      sourceId,
      title: extracted.title ?? source.name,
      rawText: extracted.text,
      meta: { filename: source.config.filename, pageCount: extracted.pageCount },
      createdAt: new Date(),
    });
    if (chunks.length > 0) {
      await orgDb.insertMany(
        "chunks",
        chunks.map((c, i) => ({ documentId, text: c.text, embedding: embeddings[i], heading: c.heading, position: c.position })),
      );
    }

    await orgDb.updateOne(
      "sources",
      { _id: sourceId },
      { $set: { status: "ready", lastSyncedAt: new Date(), chunkCount: chunks.length, errorMessage: null } },
    );
    return { documentId: documentId.toString(), chunks: chunks.length };
  },
});
