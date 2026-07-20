export interface TextChunk {
  text: string;
  heading: string | null;
  position: number;
}

const HEADING_RE = /^#{1,6}\s+(.+)$/;

interface Block {
  text: string;
  heading: string | null;
}

/** Split into paragraph blocks, each tagged with its nearest preceding heading. */
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let heading: string | null = null;
  for (const rawPara of text.split(/\n{2,}/)) {
    const para = rawPara.trim();
    if (!para) continue;
    const lines = para.split("\n");
    const buf: string[] = [];
    for (const line of lines) {
      const m = HEADING_RE.exec(line.trim());
      if (m) {
        if (buf.length) blocks.push({ text: buf.join("\n"), heading });
        buf.length = 0;
        heading = m[1].trim();
      } else {
        buf.push(line);
      }
    }
    if (buf.length) blocks.push({ text: buf.join("\n").trim(), heading });
  }
  return blocks.filter((b) => b.text.length > 0);
}

function hardSplit(text: string, maxChars: number): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    // prefer breaking at the last space inside the window
    const window = rest.slice(0, maxChars);
    const cut = window.lastIndexOf(" ") > maxChars * 0.5 ? window.lastIndexOf(" ") : maxChars;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export function chunkText(
  text: string,
  opts: { maxChars?: number; minChars?: number } = {},
): TextChunk[] {
  const maxChars = opts.maxChars ?? 2800;
  const minChars = opts.minChars ?? 200;

  const chunks: TextChunk[] = [];
  let bufText = "";
  let bufHeading: string | null = null;

  const flush = () => {
    if (bufText.trim()) {
      chunks.push({ text: bufText.trim(), heading: bufHeading, position: chunks.length });
    }
    bufText = "";
  };

  for (const block of toBlocks(text)) {
    for (const piece of hardSplit(block.text, maxChars)) {
      const candidate = bufText ? `${bufText}\n\n${piece}` : piece;
      // A comfortably-sized chunk whose next block starts a new heading reads
      // better closed out here than merged across topics.
      if (bufText && bufText.length >= minChars && block.heading !== bufHeading) {
        flush();
        bufHeading = block.heading;
        bufText = piece;
      } else if (bufText && candidate.length > maxChars) {
        flush();
        bufText = piece;
        bufHeading = block.heading;
      } else {
        if (!bufText) bufHeading = block.heading;
        bufText = candidate;
      }
    }
  }
  flush();
  return chunks;
}
