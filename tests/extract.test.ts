import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  extractFileText,
  looksScanned,
  UnsupportedFileTypeError,
} from "@/lib/ingest/extract";

async function makePdf(text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 50, y: 700, size: 12, font });
  return pdf.save();
}

describe("extractFileText", () => {
  it("extracts text from a PDF", async () => {
    const data = await makePdf("Refunds are available within 30 days.");
    const out = await extractFileText({
      data,
      contentType: "application/pdf",
      filename: "policy.pdf",
    });
    expect(out.text).toContain("Refunds are available within 30 days.");
    expect(out.pageCount).toBe(1);
  });

  it("passes markdown/plain text through and takes the first heading as title", async () => {
    const md = "# Getting started\n\nWelcome to the product.";
    const out = await extractFileText({
      data: new TextEncoder().encode(md),
      contentType: "text/markdown",
      filename: "guide.md",
    });
    expect(out.text).toBe(md);
    expect(out.title).toBe("Getting started");
  });

  it("falls back to the filename (sans extension) when there is no heading", async () => {
    const out = await extractFileText({
      data: new TextEncoder().encode("plain content"),
      contentType: "text/plain",
      filename: "faq-2026.txt",
    });
    expect(out.title).toBe("faq-2026");
  });

  it("throws UnsupportedFileTypeError for unknown types", async () => {
    await expect(
      extractFileText({
        data: new Uint8Array([1, 2, 3]),
        contentType: "image/png",
        filename: "photo.png",
      }),
    ).rejects.toBeInstanceOf(UnsupportedFileTypeError);
  });
});

describe("looksScanned", () => {
  it("flags a multi-page PDF with almost no text", () => {
    expect(looksScanned({ text: "a b", title: null, pageCount: 5 })).toBe(true);
  });
  it("does not flag a normal text-bearing document", () => {
    expect(
      looksScanned({ text: "word ".repeat(300), title: null, pageCount: 2 }),
    ).toBe(false);
  });
  it("never flags non-PDFs (pageCount null)", () => {
    expect(looksScanned({ text: "", title: null, pageCount: null })).toBe(false);
  });
});
