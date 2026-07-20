import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import { CHUNKS_VECTOR_INDEX, vectorSearchPipeline } from "@/lib/db/vectorSearch";

describe("vectorSearchPipeline", () => {
  const orgId = new ObjectId();
  const vec = [0.1, 0.2, 0.3];

  it("always pre-filters by orgId inside $vectorSearch (tenant isolation)", () => {
    const [stage] = vectorSearchPipeline(orgId, vec, 8);
    expect(stage.$vectorSearch.filter).toEqual({ orgId });
    expect(stage.$vectorSearch.index).toBe(CHUNKS_VECTOR_INDEX);
    expect(stage.$vectorSearch.path).toBe("embedding");
    expect(stage.$vectorSearch.limit).toBe(8);
    expect(stage.$vectorSearch.numCandidates).toBeGreaterThanOrEqual(8 * 10);
  });

  it("projects the score and never the embedding", () => {
    const project = vectorSearchPipeline(orgId, vec, 4).find((s) => s.$project)?.$project;
    expect(project).toBeDefined();
    expect(project!.score).toEqual({ $meta: "vectorSearchScore" });
    expect(project!.embedding).toBeUndefined();
  });
});
