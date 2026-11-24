import type { ObjectId } from "mongodb";
import type { ScoredChunk } from "@/lib/db/vectorSearch";

export interface Citation {
  chunkId: ObjectId;
  documentId: ObjectId;
}

// buildSystemPrompt mandates inline [n] markers and parseCitations below
// consumes them server-side, but the widget renders the assistant's raw text.
// Without stripping, every visitor sees literal "[1] [2]" noise in every
// reply. Kept as a pure string transform so the widget's text-only,
// React-escaped rendering is untouched — no markdown, no HTML, no links.
// One marker: "[1]", or several sources grouped the way Gemini often writes
// them: "[1, 3]", "[1,2,5]".
const MARKER = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

export function stripCitationMarkers(text: string): string {
  return (
    text
      .replace(MARKER, "")
      // Text streams in token by token, so a half-written marker would sit on
      // screen for a frame or two unless the trailing fragment goes too.
      .replace(/[ \t]*\[\d*(?:\s*,\s*\d*)*$/, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([.,;:!?])/g, "$1")
      .replace(/[ \t]+$/gm, "")
  );
}

// The prompt asks for plain text, but the model still writes markdown now and
// then, and the widget renders text only (see chat-widget.tsx for why), so
// "**+359 888 310 106**" reached visitors with its asterisks. Same contract as
// stripCitationMarkers: a pure string transform at the render boundary.
export function stripMarkdown(text: string): string {
  return (
    text
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/^[ \t]*[*-][ \t]+/gm, "• ")
      .replace(/^#{1,6}[ \t]+/gm, "")
      .replace(/(^|[^\p{L}\p{N}*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\p{L}\p{N}])/gu, "$1$2")
      // An unpaired ** or __ left over is half of a pair still streaming in.
      .replace(/\*\*|__/g, "")
  );
}

export function parseCitations(text: string, chunks: ScoredChunk[]): Citation[] {
  const seen = new Set<number>();
  const citations: Citation[] = [];
  for (const match of text.matchAll(MARKER)) {
    for (const part of match[1].split(",")) {
      const n = Number(part.trim());
      if (seen.has(n)) continue;
      const chunk = chunks[n - 1];
      if (!chunk) continue; // out-of-range reference — ignore rather than throw
      seen.add(n);
      citations.push({ chunkId: chunk._id, documentId: chunk.documentId });
    }
  }
  return citations;
}
