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

/** The site a URL belongs to: its hostname without "www." (www.acme.bg and acme.bg are one site). */
export function siteOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Sitemaps and links often use the other form (www or not, http or https) than the address entered. */
export function sameSite(a: string, b: string): boolean {
  const sa = siteOf(a);
  return sa !== null && sa === siteOf(b);
}

/** Why a page couldn't be read: the HTTP status (and whether Cloudflare answered), or a network error. */
export interface FetchFailure {
  url: string;
  status?: number;
  cloudflare?: boolean;
  error?: string;
}

/** Why a crawl found nothing to index, in words the business owner can act on. */
export function noTextMessage(pagesRead: number, failures: FetchFailure[] = []): string {
  if (pagesRead > 0) {
    return `Read ${pagesRead} page${pagesRead === 1 ? "" : "s"} but found no text to learn from. The site may build its pages with JavaScript; upload its content as a document instead.`;
  }
  const blocked = failures.find((f) => f.cloudflare && (f.status === 403 || f.status === 429 || f.status === 503));
  if (blocked) {
    return `The website's Cloudflare protection blocked SupportAI's crawler (HTTP ${blocked.status}). The site owner can allow it in Cloudflare (Security → WAF: a rule that skips requests whose user agent contains "SupportAI-Crawler"), then press Retry. Or upload the site's content as a document instead.`;
  }
  const status = failures.find((f) => f.status)?.status;
  if (status) return `Couldn't open any page of this website: it answered with HTTP ${status}. Check the address, then press Retry.`;
  const error = failures.find((f) => f.error)?.error;
  if (error) return `Couldn't reach this website (${error}). Check the address, then press Retry.`;
  return "Couldn't open any page of this website. Check the address, then press Retry.";
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const out: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const abs = new URL(href, baseUrl);
      if (!sameSite(abs.toString(), baseUrl)) return;
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

/** Cloudflare's data-cfemail value: the first byte is a key, every following byte is XOR'd with it. */
export function decodeCfEmail(hex: string): string | null {
  if (!/^(?:[0-9a-f]{2}){2,}$/i.test(hex)) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out) ? out : null;
}

export function extractMainContent(html: string): { title: string | null; text: string } {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || $("h1").first().text().trim() || null;

  // Cloudflare's email protection replaces every address with "[email protected]"
  // and hides the real one in data-cfemail; put it back so the assistant can
  // give visitors the address.
  $("[data-cfemail]").each((_, el) => {
    const email = decodeCfEmail($(el).attr("data-cfemail") ?? "");
    if (email) $(el).text(email);
  });

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
