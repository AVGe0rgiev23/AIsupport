import type { ObjectId } from "mongodb";
import type { ScoredChunk } from "@/lib/db/vectorSearch";

export interface Citation {
  chunkId: ObjectId;
  documentId: ObjectId;
}

export function parseCitations(text: string, chunks: ScoredChunk[]): Citation[] {
  const seen = new Set<number>();
  const citations: Citation[] = [];
  for (const match of text.matchAll(/\[(\d+)\]/g)) {
    const n = Number(match[1]);
    if (seen.has(n)) continue;
    const chunk = chunks[n - 1];
    if (!chunk) continue; // out-of-range reference — ignore rather than throw
    seen.add(n);
    citations.push({ chunkId: chunk._id, documentId: chunk.documentId });
  }
  return citations;
}
