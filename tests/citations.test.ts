import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import { parseCitations, stripCitationMarkers, stripMarkdown } from "@/lib/chat/citations";
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

  // Gemini groups sources: "[1, 3]" (seen in the chaykadental.com test).
  it("reads grouped markers like [1, 3]", () => {
    const chunks = [chunk(0), chunk(1), chunk(2)];
    expect(parseCitations("Цената зависи [1, 3]. Вижте [2,3].", chunks)).toEqual([
      { chunkId: chunks[0]._id, documentId: chunks[0].documentId },
      { chunkId: chunks[2]._id, documentId: chunks[2].documentId },
      { chunkId: chunks[1]._id, documentId: chunks[1].documentId },
    ]);
  });
});

// The system prompt mandates inline [n] markers and parseCitations consumes
// them server-side, but the widget renders raw text — so without stripping,
// every visitor sees literal "[1] [2]" noise in every reply.
describe("stripCitationMarkers", () => {
  it("removes [n] markers from rendered text", () => {
    expect(stripCitationMarkers("Refunds take 5 days [1].")).toBe("Refunds take 5 days.");
    expect(stripCitationMarkers("See [1] and [23] for details.")).toBe("See and for details.");
  });

  it("does not leave doubled spaces or space-before-punctuation", () => {
    expect(stripCitationMarkers("Yes [1] , definitely [2] .")).toBe("Yes, definitely.");
    expect(stripCitationMarkers("A [1] B")).toBe("A B");
  });

  // Text arrives token by token, so a half-written marker is on screen for a
  // frame or two unless the trailing fragment is stripped too.
  it("strips a partially streamed marker at the end of the text", () => {
    expect(stripCitationMarkers("Refunds take 5 days [")).toBe("Refunds take 5 days");
    expect(stripCitationMarkers("Refunds take 5 days [1")).toBe("Refunds take 5 days");
  });

  it("leaves text without markers untouched", () => {
    expect(stripCitationMarkers("No citations here.")).toBe("No citations here.");
    expect(stripCitationMarkers("")).toBe("");
  });

  it("preserves newlines", () => {
    expect(stripCitationMarkers("line one [1]\nline two [2]")).toBe("line one\nline two");
  });

  it("removes grouped markers like [1, 3] and [1,2,5]", () => {
    expect(stripCitationMarkers("Цената зависи от материала [1, 3].")).toBe("Цената зависи от материала.");
    expect(stripCitationMarkers("Вижте [1,2,5] и [4]")).toBe("Вижте и");
  });

  it("strips a partially streamed grouped marker", () => {
    expect(stripCitationMarkers("Цената зависи [1, 2")).toBe("Цената зависи");
    expect(stripCitationMarkers("Цената зависи [1,")).toBe("Цената зависи");
  });

  it("leaves ordinary bracketed text alone", () => {
    expect(stripCitationMarkers("Работим [понеделник - петък].")).toBe("Работим [понеделник - петък].");
  });
});

// The widget shows text only (no markdown rendering, on purpose), so the
// model's markdown reached visitors as literal "**+359 888 310 106**".
describe("stripMarkdown", () => {
  it("removes bold and italic markers", () => {
    expect(stripMarkdown("Обадете се на **+359 888 310 106**.")).toBe("Обадете се на +359 888 310 106.");
    expect(stripMarkdown("__важно__ и *малко*")).toBe("важно и малко");
  });

  it("turns markdown bullets into plain bullets and drops heading marks", () => {
    expect(stripMarkdown("* Почистване\n- Пломби\n### Цени")).toBe("• Почистване\n• Пломби\nЦени");
  });

  it("strips a half-streamed bold marker at the end", () => {
    expect(stripMarkdown("Телефон: **+359")).toBe("Телефон: +359");
  });

  it("leaves arithmetic and lone asterisks alone", () => {
    expect(stripMarkdown("2 * 3 = 6")).toBe("2 * 3 = 6");
  });
});
