import { generateText } from "ai";
import { chatModel } from "@/lib/ai/provider";

/**
 * Scanned/image PDFs yield no text layer. Gemini reads PDFs natively (free
 * tier included), so we ask it to transcribe. Only called when
 * looksScanned() is true — every call costs daily chat quota.
 */
export async function extractPdfWithGemini(data: Uint8Array): Promise<string> {
  const { text } = await generateText({
    model: chatModel("google"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Transcribe the complete text content of this document. Output only the text, preserving headings as markdown '#' headings. Do not summarize, comment, or omit anything.",
          },
          { type: "file", data, mediaType: "application/pdf" },
        ],
      },
    ],
  });
  return text.trim();
}
