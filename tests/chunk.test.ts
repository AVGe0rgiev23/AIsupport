import { describe, expect, it } from "vitest";
import { chunkText } from "@/lib/ingest/chunk";

const doc = [
  "# Refunds",
  "",
  "You can request a refund within 30 days. " + "Details. ".repeat(40),
  "",
  "## Partial refunds",
  "",
  "Partial refunds apply to downgrades. " + "More. ".repeat(40),
  "",
  "# Shipping",
  "",
  "We ship worldwide. " + "Info. ".repeat(40),
].join("\n");

describe("chunkText", () => {
  it("returns empty for blank input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("attributes each chunk to its nearest preceding heading", () => {
    const chunks = chunkText(doc);
    const byHeading = new Map(chunks.map((c) => [c.heading, c]));
    expect(byHeading.has("Refunds")).toBe(true);
    expect(byHeading.has("Partial refunds")).toBe(true);
    expect(byHeading.has("Shipping")).toBe(true);
  });

  it("numbers positions sequentially from 0", () => {
    const chunks = chunkText(doc);
    expect(chunks.map((c) => c.position)).toEqual(chunks.map((_, i) => i));
  });

  it("never exceeds maxChars, hard-splitting oversized paragraphs", () => {
    const oneGiantParagraph = "word ".repeat(2000); // 10,000 chars, no breaks
    const chunks = chunkText(oneGiantParagraph, { maxChars: 1000 });
    expect(chunks.length).toBeGreaterThan(9);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(1000);
  });

  it("merges tiny trailing sections instead of emitting sub-minChars fragments", () => {
    const tiny = "# A\n\nshort.\n\n# B\n\nalso short.";
    const chunks = chunkText(tiny, { maxChars: 2800, minChars: 200 });
    expect(chunks).toHaveLength(1); // both sections packed into one chunk
  });

  it("keeps heading text out of none-heading plain text", () => {
    const chunks = chunkText("No headings here.\n\nJust text.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].heading).toBeNull();
  });
});
