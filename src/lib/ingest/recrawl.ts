import type { Source } from "@/lib/db/types";

const INTERVAL_HOURS: Record<"daily" | "weekly", number> = {
  daily: 24,
  weekly: 24 * 7,
};

export function isDueForRecrawl(
  source: Pick<Source, "type" | "status" | "crawlSchedule" | "lastSyncedAt">,
  now: Date,
): boolean {
  if (source.type !== "crawl") return false;
  if (source.crawlSchedule === null) return false;
  if (source.status === "processing" || source.status === "pending") return false;
  if (source.lastSyncedAt === null) return true;
  const ageHours = (now.getTime() - source.lastSyncedAt.getTime()) / 3_600_000;
  return ageHours >= INTERVAL_HOURS[source.crawlSchedule];
}
