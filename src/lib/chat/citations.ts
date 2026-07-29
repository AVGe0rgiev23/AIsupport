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
export function stripCitationMarkers(text: string): string {
  return (
    text
      .replace(/\[\d+\]/g, "")
      // Text streams in token by token, so a half-written marker would sit on
      // screen for a frame or two unless the trailing fragment goes too.
      .replace(/[ \t]*\[\d*$/, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([.,;:!?])/g, "$1")
      .replace(/[ \t]+$/gm, "")
  );
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
