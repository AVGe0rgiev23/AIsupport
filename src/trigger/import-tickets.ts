import { ObjectId } from "mongodb";
import { metadata, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { embedTexts } from "@/lib/ai/embeddings";
import { getDb } from "@/lib/db/client";
import { withOrg } from "@/lib/db/withOrg";
import { chunkText } from "@/lib/ingest/chunk";
import { parseMbox, parseTicketsCsv } from "@/lib/ingest/tickets";
import { ingestion } from "./queues";

export const importTickets = schemaTask({
  id: "import-tickets",
  schema: z.object({ orgId: z.string(), sourceId: z.string() }),
  queue: ingestion,
  maxDuration: 900,
  onFailure: async ({ payload, error }) => {
    const db = await getDb();
    await withOrg(db, new ObjectId(payload.orgId)).updateOne(
      "sources",
      { _id: new ObjectId(payload.sourceId) },
      { $set: { status: "error", errorMessage: error instanceof Error ? error.message : String(error) } },
    );
  },
  run: async (payload) => {
    const orgId = new ObjectId(payload.orgId);
    const sourceId = new ObjectId(payload.sourceId);
    const db = await getDb();
    const orgDb = withOrg(db, orgId);

    const source = await orgDb.findOne("sources", { _id: sourceId });
    if (!source) throw new Error(`Source ${payload.sourceId} not found in org`);
    if (source.config.kind !== "ticket-import") throw new Error("import-tickets requires a ticket-import source");

    await orgDb.updateOne("sources", { _id: sourceId }, { $set: { status: "processing", errorMessage: null } });

    metadata.set("phase", "downloading");
    const res = await fetch(source.config.blobUrl);
    if (!res.ok) throw new Error(`Blob download failed: ${res.status}`);
    const text = await res.text();

    metadata.set("phase", "parsing");
    const tickets = source.config.format === "csv" ? parseTicketsCsv(text) : parseMbox(text);
    if (tickets.length === 0) throw new Error("No tickets could be parsed from the file");
    metadata.set("totalTickets", tickets.length);

    // One document per ticket; chunk each; embed everything in one paced pass.
    metadata.set("phase", "embedding");
    const perDoc = tickets.map((t) => {
      const documentId = new ObjectId();
      const rawText = `# ${t.title}\n\n${t.body}`;
      return { documentId, title: t.title, rawText, chunks: chunkText(rawText) };
    });
    const allTexts = perDoc.flatMap((d) => d.chunks.map((c) => c.text));
    metadata.set("totalChunks", allTexts.length).set("embeddedChunks", 0);
    const allEmbeddings = await embedTexts(allTexts);
    metadata.set("embeddedChunks", allTexts.length);

    // Re-import replaces this source's previous documents + chunks. Only do this
    // after embeddings have succeeded, so a failed run never leaves the source
    // without any searchable content.
    const oldDocs = await orgDb.find("documents", { sourceId }).toArray();
    if (oldDocs.length > 0) {
      await orgDb.deleteMany("chunks", { documentId: { $in: oldDocs.map((d) => d._id) } });
      await orgDb.deleteMany("documents", { sourceId });
    }

    metadata.set("phase", "saving");
    await db.collection("documents").insertMany(
      perDoc.map((d) => ({
        _id: d.documentId,
        orgId,
        sourceId,
        title: d.title,
        rawText: d.rawText,
        meta: { kind: "ticket-import" },
        createdAt: new Date(),
      })),
    );
    let cursor = 0;
    const chunkDocs = perDoc.flatMap((d) =>
      d.chunks.map((c) => ({
        documentId: d.documentId,
        text: c.text,
        embedding: allEmbeddings[cursor++],
        heading: c.heading,
        position: c.position,
      })),
    );
    if (chunkDocs.length > 0) await orgDb.insertMany("chunks", chunkDocs);

    await orgDb.updateOne(
      "sources",
      { _id: sourceId },
      { $set: { status: "ready", lastSyncedAt: new Date(), chunkCount: chunkDocs.length, errorMessage: null } },
    );
    return { tickets: tickets.length, chunks: chunkDocs.length };
  },
});
