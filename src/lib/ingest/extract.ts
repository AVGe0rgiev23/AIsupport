import mammoth from "mammoth";
import { extractText as unpdfExtractText, getDocumentProxy } from "unpdf";

export interface ExtractedFile {
  text: string;
  title: string | null;
  pageCount: number | null; // PDFs only; null for other types
}

export class UnsupportedFileTypeError extends Error {
  constructor(contentType: string, filename: string) {
    super(`Unsupported file type ${contentType} (${filename})`);
    this.name = "UnsupportedFileTypeError";
  }
}

/** Fewer than ~50 extractable chars per page usually means a scanned/image PDF. */
export const SCANNED_MIN_CHARS_PER_PAGE = 50;

export function looksScanned(extracted: ExtractedFile): boolean {
  if (extracted.pageCount === null || extracted.pageCount === 0) return false;
  return extracted.text.length / extracted.pageCount < SCANNED_MIN_CHARS_PER_PAGE;
}

function titleFrom(text: string, filename: string): string | null {
  const headingMatch = /^#{1,6}\s+(.+)$/m.exec(text);
  if (headingMatch) return headingMatch[1].trim();
  const base = filename.replace(/\.[^.]+$/, "").trim();
  return base || null;
}

export async function extractFileText(input: {
  data: Uint8Array;
  contentType: string;
  filename: string;
}): Promise<ExtractedFile> {
  const { data, contentType, filename } = input;
  const lower = filename.toLowerCase();

  if (contentType === "application/pdf" || lower.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(data);
    const { totalPages, text } = await unpdfExtractText(pdf, { mergePages: true });
    return { text: text.trim(), title: titleFrom(text, filename), pageCount: totalPages };
  }

  if (
    contentType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data) });
    return { text: value.trim(), title: titleFrom(value, filename), pageCount: null };
  }

  if (
    contentType.startsWith("text/") ||
    lower.endsWith(".md") ||
    lower.endsWith(".txt")
  ) {
    const text = new TextDecoder("utf-8").decode(data).trim();
    return { text, title: titleFrom(text, filename), pageCount: null };
  }

  throw new UnsupportedFileTypeError(contentType, filename);
}
