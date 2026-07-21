import { createHash } from "node:crypto";
import * as cheerio from "cheerio";

export function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function normalizeUrl(url: string): string {
  const u = new URL(url);
  u.hash = "";
  let s = u.toString();
  if (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

export function parseSitemap(xml: string): string[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $("url > loc")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const origin = new URL(baseUrl).origin;
  const out: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const abs = new URL(href, baseUrl);
      if (abs.origin !== origin) return;
      if (abs.protocol !== "http:" && abs.protocol !== "https:") return;
      const normalized = normalizeUrl(abs.toString());
      if (!out.includes(normalized)) out.push(normalized);
    } catch {
      // unparseable href — skip
    }
  });
  return out;
}

const NOISE_SELECTORS = "script, style, noscript, nav, header, footer, aside, form, iframe, svg";

export function extractMainContent(html: string): { title: string | null; text: string } {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || $("h1").first().text().trim() || null;

  const $root = $("main").length
    ? $("main").first()
    : $("article").length
      ? $("article").first()
      : $('[role="main"]').length
        ? $('[role="main"]').first()
        : $("body");
  $root.find(NOISE_SELECTORS).remove();

  const lines: string[] = [];
  $root.find("h1, h2, h3, h4, h5, h6, p, li, td, pre, blockquote").each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (!t) return;
    if (tag.startsWith("h")) {
      lines.push(`${"#".repeat(Number(tag[1]))} ${t}`);
    } else {
      lines.push(t);
    }
  });
  // Fallback for pages with no structural elements at all
  const text = lines.length ? lines.join("\n\n") : $root.text().replace(/\s+/g, " ").trim();
  return { title, text };
}
