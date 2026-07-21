import { describe, expect, it } from "vitest";
import {
  contentHash,
  extractLinks,
  extractMainContent,
  normalizeUrl,
  parseSitemap,
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
