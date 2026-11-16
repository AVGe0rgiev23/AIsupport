import { ObjectId } from "mongodb";
import { logger, metadata, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { embedTexts } from "@/lib/ai/embeddings";
import { getDb } from "@/lib/db/client";
import { withOrg } from "@/lib/db/withOrg";
import { chunkText } from "@/lib/ingest/chunk";
import {
  contentHash,
  extractLinks,
  extractMainContent,
  type FetchFailure,
  noTextMessage,
  normalizeUrl,
  parseSitemap,
  prioritizeUrls,
  sameSite,
} from "@/lib/ingest/crawl";
import { ingestion } from "./queues";

const MAX_PAGES_CAP = 50;
const MAX_DEPTH_CAP = 3;
const POLITENESS_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Identifies itself honestly, so a site owner can allow it by name, and asks
// for HTML in Bulgarian or English like a browser would.
const CRAWLER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; SupportAI-Crawler/0.2; +https://supportai-beta.vercel.app)",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "bg,en;q=0.8",
};

/** The page's HTML, or null; why it failed is pushed onto `failures`. */
async function fetchPage(url: string, failures: FetchFailure[]): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: CRAWLER_HEADERS, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      const cloudflare = (res.headers.get("server") ?? "").toLowerCase().includes("cloudflare") || res.headers.has("cf-ray");
      failures.push({ url, status: res.status, cloudflare });
      logger.warn("page not readable", { url, status: res.status, cloudflare });
      return null;
    }
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html") && !type.includes("xml")) return null;
    return await res.text();
  } catch (err) {
    failures.push({ url, error: err instanceof Error ? err.message : String(err) });
    logger.warn("fetch failed", { url, err: String(err) });
    return null;
  }
}

export const crawlWebsite = schemaTask({
  id: "crawl-website",
  schema: z.object({ orgId: z.string(), sourceId: z.string() }),
  queue: ingestion,
  maxDuration: 1800, // 50 pages * (fetch + politeness) + paced embedding
  onFailure: async ({ payload, error }) => {
    const db = await getDb();
    await withOrg(db, new ObjectId(payload.orgId)).updateOne(
      "sources",
      { _id: new ObjectId(payload.sourceId) },
      { $set: { status: "error", errorMessage: error instanceof Error ? error.message : String(error) } },
    );
  },
  run: async (payload) => {
    const orgId = new ObjectId(payload.orgId);
    const sourceId = new ObjectId(payload.sourceId);
    const db = await getDb();
    const orgDb = withOrg(db, orgId);

    const source = await orgDb.findOne("sources", { _id: sourceId });
    if (!source) throw new Error(`Source ${payload.sourceId} not found in org`);
    if (source.config.kind !== "crawl") throw new Error("crawl-website requires a crawl source");
    const maxPages = Math.min(source.config.maxPages, MAX_PAGES_CAP);
    const maxDepth = Math.min(source.config.maxDepth, MAX_DEPTH_CAP);
    const rootUrl = normalizeUrl(source.config.rootUrl);

    await orgDb.updateOne("sources", { _id: sourceId }, { $set: { status: "processing", errorMessage: null } });

    // --- discover ---
    metadata.set("phase", "discovering");
    const origin = new URL(rootUrl).origin;
    let queue: { url: string; depth: number }[];
    const failures: FetchFailure[] = [];
    const sitemapXml = await fetchPage(`${origin}/sitemap.xml`, []); // a missing sitemap is normal
    // Same site even when the sitemap uses the other form (www.istra-luxe.bg
    // entered, sitemap lists istra-luxe.bg): that used to drop every URL.
    const sitemapUrls = sitemapXml ? parseSitemap(sitemapXml).filter((u) => sameSite(u, rootUrl)) : [];
    if (sitemapUrls.length > 0) {
      // Main pages first: a sitemap can list 100+ URLs (istra-luxe.bg has 125,
      // mostly project pages with no text), and only maxPages get read.
      queue = prioritizeUrls(sitemapUrls)
        .slice(0, maxPages)
        .map((u) => ({ url: normalizeUrl(u), depth: 0 }));
    } else {
      queue = [{ url: rootUrl, depth: 0 }];
    }
    metadata.set("discovered", queue.length);

    // --- crawl ---
    metadata.set("phase", "crawling").set("crawled", 0).set("changed", 0).set("unchanged", 0);
    const visited = new Set<string>();
    const changedPages: { url: string; title: string | null; text: string; hash: string }[] = [];
    let crawled = 0;
    let unchanged = 0;

    while (queue.length > 0 && crawled < maxPages) {
      const { url, depth } = queue.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);

      const html = await fetchPage(url, failures);
      await sleep(POLITENESS_MS);
      if (html === null) continue;
      crawled++;
      metadata.set("crawled", crawled);

      const { title, text } = extractMainContent(html);
      if (text.length >= 80) {
        const hash = contentHash(text);
        const existing = await orgDb.findOne("documents", { sourceId, "meta.url": url });
        if (existing && (existing.meta as { contentHash?: string }).contentHash === hash) {
          unchanged++;
          metadata.set("unchanged", unchanged);
        } else {
          changedPages.push({ url, title, text, hash });
          metadata.set("changed", changedPages.length);
        }
      }

      if (sitemapUrls.length === 0 && depth < maxDepth) {
        for (const link of extractLinks(html, url)) {
          if (!visited.has(link)) queue.push({ url: link, depth: depth + 1 });
        }
        metadata.set("discovered", visited.size + queue.length);
      }
    }

    // --- embed + save changed pages ---
    metadata.set("phase", "embedding");
    for (const pageData of changedPages) {
      const chunks = chunkText(pageData.text);
      if (chunks.length === 0) continue;
      const embeddings = await embedTexts(chunks.map((c) => c.text));

      metadata.set("phase", "saving");
      const old = await orgDb.findOne("documents", { sourceId, "meta.url": pageData.url });
      if (old) {
        await orgDb.deleteMany("chunks", { documentId: old._id });
        await orgDb.deleteMany("documents", { _id: old._id });
      }
      const documentId = new ObjectId();
      await db.collection("documents").insertOne({
        _id: documentId,
        orgId,
        sourceId,
        title: pageData.title ?? pageData.url,
        rawText: pageData.text,
        meta: { url: pageData.url, contentHash: pageData.hash },
        createdAt: new Date(),
      });
      await orgDb.insertMany(
        "chunks",
        chunks.map((c) => ({ documentId, text: c.text, embedding: embeddings[c.position], heading: c.heading, position: c.position })),
      );
      metadata.set("phase", "embedding");
    }

    const chunkCount = await orgDb.countDocuments("chunks", {
      documentId: { $in: (await orgDb.find("documents", { sourceId }).toArray()).map((d) => d._id) },
    });
    // "Ready" with nothing indexed looked like success while the assistant knew
    // nothing, so every answer became a hand-off. Say what went wrong instead.
    await orgDb.updateOne(
      "sources",
      { _id: sourceId },
      chunkCount > 0
        ? { $set: { status: "ready", lastSyncedAt: new Date(), chunkCount, errorMessage: null } }
        : { $set: { status: "error", lastSyncedAt: new Date(), chunkCount, errorMessage: noTextMessage(crawled, failures) } },
    );
    return { crawled, changed: changedPages.length, unchanged, chunkCount };
  },
});
