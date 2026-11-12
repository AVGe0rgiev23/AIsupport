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

/**
 * Sitemap order is arbitrary, and only the first maxPages URLs get crawled.
 * Put the pages a visitor asks about first: the home page and top-level pages
 * (services, contacts, about) before deep ones like /projects/some-building.
 * Stable, so pages at the same depth keep the sitemap's order.
 */
export function prioritizeUrls(urls: string[]): string[] {
  const depth = (u: string) => {
    try {
      return new URL(u).pathname.split("/").filter(Boolean).length;
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  };
  return urls
    .map((url, i) => ({ url, i, d: depth(url) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.url);
}

/** Why a crawl found nothing to index, in words the business owner can act on. */
export function noTextMessage(pagesRead: number): string {
  return pagesRead === 0
    ? "Couldn't open any page of this website. Check the address, then press Retry."
    : `Read ${pagesRead} page${pagesRead === 1 ? "" : "s"} but found no text to learn from. The site may build its pages with JavaScript; upload its content as a document instead.`;
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
