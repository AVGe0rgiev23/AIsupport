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
  normalizeUrl,
  parseSitemap,
} from "@/lib/ingest/crawl";
import { ingestion } from "./queues";

const MAX_PAGES_CAP = 50;
const MAX_DEPTH_CAP = 3;
const POLITENESS_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "SupportAI-Crawler/0.1" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html") && !type.includes("xml")) return null;
    return await res.text();
  } catch (err) {
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
    const sitemapXml = await fetchPage(`${origin}/sitemap.xml`);
    const sitemapUrls = sitemapXml ? parseSitemap(sitemapXml).filter((u) => u.startsWith(origin)) : [];
    if (sitemapUrls.length > 0) {
      queue = sitemapUrls.slice(0, maxPages).map((u) => ({ url: normalizeUrl(u), depth: 0 }));
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

      const html = await fetchPage(url);
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
    await orgDb.updateOne(
      "sources",
      { _id: sourceId },
      { $set: { status: "ready", lastSyncedAt: new Date(), chunkCount, errorMessage: null } },
    );
    return { crawled, changed: changedPages.length, unchanged, chunkCount };
  },
});
