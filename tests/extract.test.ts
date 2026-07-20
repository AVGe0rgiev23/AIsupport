import JSZip from "jszip";
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

/** Hand-builds a minimal but valid .docx (an OOXML zip) containing a single paragraph. */
async function makeDocx(text: string): Promise<Uint8Array> {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${text}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`,
  );

  return zip.generateAsync({ type: "uint8array" });
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

  it("extracts text from a DOCX", async () => {
    const data = await makeDocx("Refunds are available within 30 days.");
    const out = await extractFileText({
      data,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: "policy.docx",
    });
    expect(out.text).toContain("Refunds are available within 30 days.");
    expect(out.pageCount).toBeNull();
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
