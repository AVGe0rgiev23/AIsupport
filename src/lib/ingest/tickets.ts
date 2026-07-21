import Papa from "papaparse";

export interface ImportedTicket {
  title: string;
  body: string;
}

export function parseTicketsCsv(text: string): ImportedTicket[] {
  const { data, meta } = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
  });
  const headers = meta.fields ?? [];
  const titleCol =
    headers.find((h) => /question|subject|title/i.test(h)) ?? headers[0];
  const bodyCol =
    headers.find((h) => /answer|body|resolution|description|reply/i.test(h)) ??
    headers[1] ??
    headers[0];

  return data
    .map((row) => ({
      title: (row[titleCol] ?? "").trim(),
      body: (row[bodyCol] ?? "").trim(),
    }))
    .filter((t) => t.title.length > 0);
}

const FROM_LINE = /^From \S+.*$/m;

export function parseMbox(text: string): ImportedTicket[] {
  if (!FROM_LINE.test(text)) return [];
  const messages = text.split(/^From \S+.*$/m).slice(1); // drop pre-first-From prefix
  const out: ImportedTicket[] = [];
  for (const raw of messages) {
    // Don't strip a leading newline before searching: a header-less message's
    // chunk starts with "\n\n" (end of the From line + the blank separator),
    // and stripping one \n would hide that separator, wrongly dropping the body.
    const sepIndex = raw.indexOf("\n\n");
    const headerBlock = sepIndex === -1 ? raw : raw.slice(0, sepIndex);
    const body = (sepIndex === -1 ? "" : raw.slice(sepIndex + 2)).trim();
    if (!body) continue;
    const subject = /^Subject:\s*(.+)$/im.exec(headerBlock)?.[1]?.trim();
    out.push({ title: subject || "(no subject)", body });
  }
  return out;
}
