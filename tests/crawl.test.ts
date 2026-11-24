import { describe, expect, it } from "vitest";
import {
  contentHash,
  decodeCfEmail,
  extractLinks,
  extractMainContent,
  infoPagesFirst,
  noTextMessage,
  normalizeUrl,
  parseSitemap,
  prioritizeUrls,
  sameSite,
  scopeToRoot,
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

  // chaykadental.com (SP Page Builder): every price row is divs and spans, and
  // the name and price are adjacent spans with no space between them.
  it("reads price rows built from divs and spans, with a space between name and price", () => {
    const html = `<main><h3>Прегледи</h3>
      <div class="sppb-addon-pricelist"><div class="pricelist-text-content"><div class="sppb-addon-title">
        <span class="pricelist-title-content"><span class="pricelist-title">Цялостен преглед на устна кухина</span><span class="pricelist-price-content"><span class="pricelist-price">20€<span class="pricelist-point-zero"></span></span> </span></span>
      </div><div class="sppb-addon-content"><p></p></div></div></div>
      <div class="sppb-addon-pricelist"><div class="pricelist-text-content"><div class="sppb-addon-title"><span class="pricelist-title">Контактна анестезия</span><span class="pricelist-price">15€</span></div></div></div>
    </main>`;
    const { text } = extractMainContent(html);
    expect(text).toContain("### Прегледи");
    expect(text).toContain("Цялостен преглед на устна кухина 20€");
    expect(text).toContain("Контактна анестезия 15€");
  });

  it("keeps text that sits directly in a div next to child blocks", () => {
    const { text } = extractMainContent(`<main><div>Работим всеки ден<div><p>Без почивни дни</p></div>след 9:00</div></main>`);
    expect(text.split("\n\n")).toEqual(["Работим всеки ден", "Без почивни дни", "след 9:00"]);
  });

  it("keeps a list item's own text when it has a nested list", () => {
    const { text } = extractMainContent(`<main><ul><li>Услуги<ul><li>Почистване</li></ul></li></ul></main>`);
    expect(text).toContain("Услуги");
    expect(text).toContain("Почистване");
  });

  it("puts a table row on one line so a price stays next to its service", () => {
    const { text } = extractMainContent(
      `<main><table><tr><th>Услуга</th><th>Цена</th></tr><tr><td>Пломба</td><td>65 €</td></tr></table></main>`,
    );
    expect(text).toContain("Пломба | 65 €");
  });

  it("does not split punctuation off inline links", () => {
    const { text } = extractMainContent(`<main><p>Пишете ни на <a href="/k">формата</a>.</p></main>`);
    expect(text).toBe("Пишете ни на формата.");
  });
});

describe("scopeToRoot", () => {
  const urls = [
    "https://chaykadental.com/bg",
    "https://chaykadental.com/en",
    "https://chaykadental.com/bg/tsenorazpis",
    "https://chaykadental.com/en/prices",
    "https://chaykadental.com/bgx",
  ];

  // chaykadental.com/bg was entered, and the English home page used one of
  // the crawl's 25 pages.
  it("keeps only pages under the path that was entered", () => {
    expect(scopeToRoot(urls, "https://chaykadental.com/bg")).toEqual([
      "https://chaykadental.com/bg",
      "https://chaykadental.com/bg/tsenorazpis",
    ]);
  });

  it("keeps everything when the home page was entered", () => {
    expect(scopeToRoot(urls, "https://chaykadental.com")).toEqual(urls);
  });

  it("keeps everything rather than nothing when no page is under the path", () => {
    expect(scopeToRoot(urls, "https://chaykadental.com/kontakti")).toEqual(urls);
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

  // toniks.net (PrestaShop): 9 of the 50 crawled pages were cart and account
  // links, and requesting an add-to-cart link can change the shop's state.
  it("skips cart, account and other action links, and files", () => {
    const html = [
      `<a href="/cart?add=1&id_product=163&token=cd46">buy</a>`,
      `<a href="/my-account">a</a>`,
      `<a href="/login?back=my-account">l</a>`,
      `<a href="/index.php?controller=order">o</a>`,
      `<a href="/wishlist">w</a>`,
      `<a href="/katalog.pdf">pdf</a>`,
      `<a href="/43-chesto-zadavani-vprosi">faq</a>`,
      `<a href="/kuhni/131-kukhnya-krasi.html">kitchen</a>`,
    ].join("");
    expect(extractLinks(html, "https://toniks.net/")).toEqual([
      "https://toniks.net/43-chesto-zadavani-vprosi",
      "https://toniks.net/kuhni/131-kukhnya-krasi.html",
    ]);
  });
});

describe("infoPagesFirst", () => {
  it("moves FAQ, contact, price and about pages ahead of the rest, keeping order otherwise", () => {
    const urls = [
      "https://toniks.net/kuhni/131-kukhnya-krasi.html",
      "https://toniks.net/43-chesto-zadavani-vprosi",
      "https://toniks.net/30-proekti",
      "https://toniks.net/content/9-kontakti",
      "https://chaykadental.com/bg/tsenorazpis",
      "https://example.bg/za-nas",
      "https://example.bg/%D0%BA%D0%BE%D0%BD%D1%82%D0%B0%D0%BA%D1%82%D0%B8",
    ];
    expect(infoPagesFirst(urls)).toEqual([
      "https://toniks.net/43-chesto-zadavani-vprosi",
      "https://toniks.net/content/9-kontakti",
      "https://chaykadental.com/bg/tsenorazpis",
      "https://example.bg/za-nas",
      "https://example.bg/%D0%BA%D0%BE%D0%BD%D1%82%D0%B0%D0%BA%D1%82%D0%B8",
      "https://toniks.net/kuhni/131-kukhnya-krasi.html",
      "https://toniks.net/30-proekti",
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

describe("Cloudflare-protected email addresses", () => {
  // Encodes like Cloudflare does: a key byte, then each character XOR'd with it
  const encode = (email: string, key = 0x30) =>
    [key, ...[...email].map((c) => c.charCodeAt(0) ^ key)].map((b) => b.toString(16).padStart(2, "0")).join("");

  it("decodes data-cfemail back to the address", () => {
    expect(decodeCfEmail(encode("sofia@istra-luxe.bg"))).toBe("sofia@istra-luxe.bg");
    expect(decodeCfEmail("zz")).toBeNull();
  });

  it("puts real addresses into the extracted text instead of [email protected]", () => {
    const html = `<main><p>Офис София</p><p><a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="${encode("sofia@istra-luxe.bg")}">[email&#160;protected]</a></p></main>`;
    const { text } = extractMainContent(html);
    expect(text).toContain("sofia@istra-luxe.bg");
    expect(text).not.toContain("protected");
  });
});
