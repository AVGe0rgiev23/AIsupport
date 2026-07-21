import { logger, schedules, tasks } from "@trigger.dev/sdk";
import type { Source } from "@/lib/db/types";
import { getDb } from "@/lib/db/client";
import { isDueForRecrawl } from "@/lib/ingest/recrawl";
import type { crawlWebsite } from "./crawl-website";

export const scheduledRecrawl = schedules.task({
  id: "scheduled-recrawl",
  cron: "0 */6 * * *", // every 6h; isDueForRecrawl enforces the real cadence
  run: async () => {
    const db = await getDb();
    // Documented cross-org READ exception (see plan Global Constraints):
    // scheduling must scan all orgs' crawl sources. Writes stay org-scoped
    // inside crawl-website.
    const candidates = await db
      .collection<Source>("sources")
      .find({ type: "crawl", crawlSchedule: { $ne: null } })
      .toArray();

    const now = new Date();
    const due = candidates.filter((s) => isDueForRecrawl(s, now));
    logger.info("recrawl sweep", { candidates: candidates.length, due: due.length });

    for (const source of due) {
      await tasks.trigger<typeof crawlWebsite>(
        "crawl-website",
        { orgId: source.orgId.toString(), sourceId: source._id.toString() },
        { tags: [`org:${source.orgId.toString()}`, `source:${source._id.toString()}`] },
      );
    }
    return { triggered: due.length };
  },
});
