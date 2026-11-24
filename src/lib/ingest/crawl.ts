import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import type { AnyNode, Element, Text } from "domhandler";

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
    .map((url, i) => ({ url, i, d: depth(url), info: isInfoPage(url) ? 0 : 1 }))
    .sort((a, b) => a.d - b.d || a.info - b.info || a.i - b.i)
    .map((x) => x.url);
}

// Pages that answer what visitors ask: FAQ, contacts, prices, about, delivery,
// payment, services, terms. In URLs written in Latin letters (chesto-zadavani-
// vprosi, kontakti, tsenorazpis) and in Cyrillic ones.
const INFO_PAGE =
  /faq|chesto|v[au]?prosi|question|kontakt|contact|tsen|ceni|cenorazpis|cenova|price|pricing|za-nas|about|dostavka|delivery|shipping|plashtane|payment|uslugi|services|rabotno|hours|garanc|warranty|usloviya|terms|kak-da|въпрос|контакт|цени|ценоразпис|за-нас|доставка|плащане|услуги|работно|гаранц|условия/i;

export function isInfoPage(url: string): boolean {
  try {
    return INFO_PAGE.test(decodeURIComponent(new URL(url).pathname));
  } catch {
    return false;
  }
}

/**
 * Info pages first, otherwise in the order found. Following links on a shop
 * (toniks.net) read 50 product pages and never reached the FAQ linked from
 * the home page.
 */
export function infoPagesFirst(urls: string[]): string[] {
  return [...urls.filter(isInfoPage), ...urls.filter((u) => !isInfoPage(u))];
}

/**
 * When a section was entered (chaykadental.com/bg), crawl only that section:
 * a sitemap lists every language, and the other one used up the page limit.
 * The home page means the whole site; a path nothing sits under (a single
 * page was entered) also falls back to the whole list rather than to nothing.
 */
export function scopeToRoot(urls: string[], rootUrl: string): string[] {
  const prefix = new URL(rootUrl).pathname.replace(/\/+$/, "");
  if (!prefix) return urls;
  const inScope = urls.filter((u) => {
    try {
      const path = new URL(u).pathname.replace(/\/+$/, "");
      return path === prefix || path.startsWith(`${prefix}/`);
    } catch {
      return false;
    }
  });
  return inScope.length > 1 ? inScope : urls;
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

// Links that do something (add to cart, log in) or download a file rather than
// show a page. On toniks.net they were 9 of the 50 pages read, and a request
// to an add-to-cart link can change the shop's state.
const ACTION_PATH =
  /(?:^|\/)(?:cart|basket|kolichka|checkout|order|orders|poruchka|login|logout|signin|sign-in|register|registration|my-account|account|password|wishlist|compare|cdn-cgi)(?:\/|$|\.)/i;
const ACTION_QUERY = /(?:^|[?&])(?:add|add-to-cart|add_to_cart|action|token|logout|remove|delete)=/i;
const ACTION_CONTROLLER = /(?:^|[?&])controller=(?:cart|order|order-opc|authentication|my-account|password|history|addresses|identity|wishlist)(?:&|$)/i;
const FILE = /\.(?:pdf|jpe?g|png|gif|webp|svg|zip|rar|7z|docx?|xlsx?|pptx?|mp4|mp3|avi)$/i;

function isActionOrFile(url: URL): boolean {
  return ACTION_PATH.test(url.pathname) || ACTION_QUERY.test(url.search) || ACTION_CONTROLLER.test(url.search) || FILE.test(url.pathname);
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
      if (isActionOrFile(abs)) return;
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

  const lines = blockLines($root.get(0)?.children ?? []);
  return { title, text: lines.join("\n\n") };
}

/*
  Block elements start a new line; everything else (span, a, strong, …) runs
  inline. Reading only p/li/td/h* used to drop whole pages built with page
  builders, where every row is divs and spans: chaykadental.com's price list
  came out as its section headings with not one price under them.
*/
const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "caption", "dd", "details", "div", "dl", "dt",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "summary", "table",
  "tbody", "tfoot", "thead", "tr", "ul",
]);

/**
 * Each block's own text becomes one line, in document order; headings become
 * markdown ("## …"). Two inline elements side by side get a space between them
 * (`<span>Пломба</span><span>65€</span>` → "Пломба 65€"), but text running into
 * an element doesn't ("формата</a>." stays "формата."). A table row is one line
 * with its cells joined by " | ", so a price stays next to its service.
 */
function blockLines(nodes: AnyNode[]): string[] {
  const lines: string[] = [];
  let buf = "";

  const flush = (heading?: string) => {
    const t = buf.replace(/\s+/g, " ").trim();
    buf = "";
    if (t) lines.push(heading ? `${"#".repeat(Number(heading[1]))} ${t}` : t);
  };

  const walk = (children: AnyNode[], inRow: boolean) => {
    let prevWasElement = false;
    let cells = 0;
    for (const node of children) {
      if (node.type === "text") {
        buf += (node as Text).data;
        prevWasElement = false;
        continue;
      }
      if (node.type !== "tag") continue; // comments, directives; script/style are already removed
      const el = node as Element;
      const tag = el.tagName.toLowerCase();

      if (tag === "br") {
        buf += " ";
      } else if (tag === "td" || tag === "th") {
        if (cells++ > 0) buf += " | ";
        walk(el.children, true);
      } else if (tag === "tr") {
        flush();
        walk(el.children, true);
        flush();
      } else if (BLOCK_TAGS.has(tag) && !inRow) {
        flush();
        walk(el.children, false);
        flush(/^h[1-6]$/.test(tag) ? tag : undefined);
      } else {
        if (prevWasElement) buf += " ";
        walk(el.children, inRow);
      }
      prevWasElement = true;
    }
  };

  walk(nodes, false);
  flush();
  return lines;
}
