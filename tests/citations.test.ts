import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import { parseCitations } from "@/lib/chat/citations";
import type { ScoredChunk } from "@/lib/db/vectorSearch";

function chunk(i: number): ScoredChunk {
  return {
    _id: new ObjectId(),
    documentId: new ObjectId(),
    text: `chunk ${i}`,
    heading: null,
    position: i,
    score: 1,
  };
}

describe("parseCitations", () => {
  it("maps [n] markers to the nth chunk (1-indexed)", () => {
    const chunks = [chunk(0), chunk(1), chunk(2)];
    const result = parseCitations("Refunds take 5 days [1]. See also [3].", chunks);
    expect(result).toEqual([
      { chunkId: chunks[0]._id, documentId: chunks[0].documentId },
      { chunkId: chunks[2]._id, documentId: chunks[2].documentId },
    ]);
  });

  it("dedupes repeated citations, preserving first-seen order", () => {
    const chunks = [chunk(0), chunk(1)];
    const result = parseCitations("[2] and again [2] and [1]", chunks);
    expect(result).toEqual([
      { chunkId: chunks[1]._id, documentId: chunks[1].documentId },
      { chunkId: chunks[0]._id, documentId: chunks[0].documentId },
    ]);
  });

  it("ignores out-of-range references instead of throwing", () => {
    const chunks = [chunk(0)];
    expect(parseCitations("See [5] for details.", chunks)).toEqual([]);
  });

  it("returns [] for text with no citations", () => {
    expect(parseCitations("No citations here.", [chunk(0)])).toEqual([]);
  });
});
