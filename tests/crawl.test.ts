import { describe, expect, it } from "vitest";
import {
  contentHash,
  extractLinks,
  extractMainContent,
  noTextMessage,
  normalizeUrl,
  parseSitemap,
  prioritizeUrls,
  sameSite,
} from "@/lib/ingest/crawl";

const page = `
<html><head><title>Help Center — Acme</title></head><body>
  <nav><a href="/pricing">Pricing nav noise</a></nav>
  <main>
    <h1>Refund policy</h1>
    <p>Refunds within 30 days.</p>
    <h2>Exceptions</h2>
    <p>Digital goods are final sale.</p>
    <script>track()</script>
  </main>
  <footer>© Acme</footer>
</body></html>`;

describe("extractMainContent", () => {
  it("keeps main content, drops nav/footer/script, preserves headings as markdown", () => {
    const { title, text } = extractMainContent(page);
    expect(title).toBe("Help Center — Acme");
    expect(text).toContain("# Refund policy");
    expect(text).toContain("## Exceptions");
    expect(text).toContain("Refunds within 30 days.");
    expect(text).not.toContain("Pricing nav noise");
    expect(text).not.toContain("© Acme");
    expect(text).not.toContain("track()");
  });

  it("falls back to body when there is no main/article", () => {
    const { text } = extractMainContent("<html><body><p>bare page</p></body></html>");
    expect(text).toBe("bare page");
  });
});

describe("parseSitemap", () => {
  it("extracts loc urls", () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://a.com/x</loc></url><url><loc>https://a.com/y</loc></url></urlset>`;
    expect(parseSitemap(xml)).toEqual(["https://a.com/x", "https://a.com/y"]);
  });
  it("returns [] for non-sitemap content", () => {
    expect(parseSitemap("<html>404</html>")).toEqual([]);
  });
});

describe("extractLinks", () => {
  it("resolves relative links against the base and keeps same-origin http(s) only", () => {
    const html = `<a href="/docs">d</a><a href="https://a.com/faq#top">f</a><a href="https://evil.com/x">e</a><a href="mailto:x@a.com">m</a>`;
    expect(extractLinks(html, "https://a.com/start")).toEqual([
      "https://a.com/docs",
      "https://a.com/faq",
    ]);
  });
});

describe("normalizeUrl", () => {
  it("strips hash fragments and trailing slashes", () => {
    expect(normalizeUrl("https://a.com/docs/#install")).toBe("https://a.com/docs");
    expect(normalizeUrl("https://a.com/")).toBe("https://a.com");
  });
});

describe("contentHash", () => {
  it("is stable for equal text and differs otherwise", () => {
    expect(contentHash("abc")).toBe(contentHash("abc"));
    expect(contentHash("abc")).not.toBe(contentHash("abd"));
    expect(contentHash("abc")).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("prioritizeUrls", () => {
  it("puts the home page and top-level pages before deep ones, keeping sitemap order otherwise", () => {
    const urls = [
      "https://istra-luxe.bg/projects/hotel-palms-beach-kiten",
      "https://istra-luxe.bg/",
      "https://istra-luxe.bg/products/aluminium-railings/aluminievi-parapeti-sys-struni",
      "https://istra-luxe.bg/services",
      "https://istra-luxe.bg/contacts",
      "https://istra-luxe.bg/projects/ironcode-varna",
    ];
    expect(prioritizeUrls(urls)).toEqual([
      "https://istra-luxe.bg/",
      "https://istra-luxe.bg/services",
      "https://istra-luxe.bg/contacts",
      "https://istra-luxe.bg/projects/hotel-palms-beach-kiten",
      "https://istra-luxe.bg/projects/ironcode-varna",
      "https://istra-luxe.bg/products/aluminium-railings/aluminievi-parapeti-sys-struni",
    ]);
  });
});

describe("noTextMessage", () => {
  it("explains an empty crawl instead of calling it ready", () => {
    expect(noTextMessage(0)).toMatch(/Couldn't open any page/);
    expect(noTextMessage(12)).toMatch(/Read 12 pages but found no text/);
  });
});

describe("www and non-www are one site", () => {
  it("matches sitemap URLs and links across www., http and https", () => {
    expect(sameSite("https://istra-luxe.bg/contacts", "https://www.istra-luxe.bg")).toBe(true);
    expect(sameSite("http://www.istra-luxe.bg/", "https://istra-luxe.bg/services")).toBe(true);
    expect(sameSite("https://evil.bg/istra-luxe.bg", "https://istra-luxe.bg")).toBe(false);
    expect(sameSite("https://shop.istra-luxe.bg", "https://istra-luxe.bg")).toBe(false);
  });

  it("follows links to the bare domain from a www page", () => {
    const html = '<a href="https://istra-luxe.bg/contacts">c</a><a href="https://other.bg/x">o</a>';
    expect(extractLinks(html, "https://www.istra-luxe.bg/")).toEqual(["https://istra-luxe.bg/contacts"]);
  });
});

describe("noTextMessage says why nothing could be read", () => {
  it("names a Cloudflare block and how the owner can allow the crawler", () => {
    const msg = noTextMessage(0, [{ url: "https://www.istra-luxe.bg", status: 403, cloudflare: true }]);
    expect(msg).toMatch(/Cloudflare protection blocked/);
    expect(msg).toMatch(/SupportAI-Crawler/);
  });
  it("gives the HTTP status or the network error otherwise", () => {
    expect(noTextMessage(0, [{ url: "u", status: 404 }])).toMatch(/HTTP 404/);
    expect(noTextMessage(0, [{ url: "u", error: "getaddrinfo ENOTFOUND" }])).toMatch(/ENOTFOUND/);
  });
});
