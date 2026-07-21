import { describe, expect, it } from "vitest";
import { isDueForRecrawl } from "@/lib/ingest/recrawl";

const now = new Date("2026-07-19T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

const base = { type: "crawl" as const, status: "ready" as const };

describe("isDueForRecrawl", () => {
  it("daily source synced 25h ago is due; 23h ago is not", () => {
    expect(isDueForRecrawl({ ...base, crawlSchedule: "daily", lastSyncedAt: hoursAgo(25) }, now)).toBe(true);
    expect(isDueForRecrawl({ ...base, crawlSchedule: "daily", lastSyncedAt: hoursAgo(23) }, now)).toBe(false);
  });

  it("weekly source synced 8 days ago is due; 6 days ago is not", () => {
    expect(isDueForRecrawl({ ...base, crawlSchedule: "weekly", lastSyncedAt: hoursAgo(24 * 8) }, now)).toBe(true);
    expect(isDueForRecrawl({ ...base, crawlSchedule: "weekly", lastSyncedAt: hoursAgo(24 * 6) }, now)).toBe(false);
  });

  it("never-synced scheduled source is due", () => {
    expect(isDueForRecrawl({ ...base, crawlSchedule: "daily", lastSyncedAt: null }, now)).toBe(true);
  });

  it("unscheduled, non-crawl, or currently-processing sources are never due", () => {
    expect(isDueForRecrawl({ ...base, crawlSchedule: null, lastSyncedAt: hoursAgo(100) }, now)).toBe(false);
    expect(isDueForRecrawl({ type: "file", status: "ready", crawlSchedule: "daily", lastSyncedAt: hoursAgo(100) }, now)).toBe(false);
    expect(isDueForRecrawl({ type: "crawl", status: "processing", crawlSchedule: "daily", lastSyncedAt: hoursAgo(100) }, now)).toBe(false);
  });

  it("errored crawl sources retry on schedule (transient site outages heal)", () => {
    expect(isDueForRecrawl({ type: "crawl", status: "error", crawlSchedule: "daily", lastSyncedAt: hoursAgo(25) }, now)).toBe(true);
  });
});
