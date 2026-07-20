import type { Db, Document, ObjectId } from "mongodb";
import type { Chunk } from "./types";

export const CHUNKS_VECTOR_INDEX = "chunks_vector_index";

export type ScoredChunk = Pick<
  Chunk,
  "_id" | "documentId" | "text" | "heading" | "position"
> & { score: number };

export function vectorSearchPipeline(
  orgId: ObjectId,
  queryVector: number[],
  k: number,
): Document[] {
  return [
    {
      $vectorSearch: {
        index: CHUNKS_VECTOR_INDEX,
        path: "embedding",
        queryVector,
        numCandidates: k * 15,
        limit: k,
        filter: { orgId },
      },
    },
    {
      $project: {
        documentId: 1,
        text: 1,
        heading: 1,
        position: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ];
}

export async function searchChunks(
  db: Db,
  orgId: ObjectId,
  queryVector: number[],
  k = 8,
): Promise<ScoredChunk[]> {
  return db
    .collection("chunks")
    .aggregate<ScoredChunk>(vectorSearchPipeline(orgId, queryVector, k))
    .toArray();
}
