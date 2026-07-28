import type { Db, ObjectId } from "mongodb";
import { withOrg } from "./db/withOrg";

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === 11000
  );
}

export async function getTodayUsage(db: Db, orgId: ObjectId): Promise<number> {
  const rows = await withOrg(db, orgId)
    .find("llmUsage", { date: todayUTC() })
    .toArray();
  return rows.reduce((sum, r) => sum + r.requests, 0);
}

export async function incrementUsage(
  db: Db,
  orgId: ObjectId,
  provider: string,
  tokens: number,
): Promise<void> {
  const org = withOrg(db, orgId);
  const filter = { date: todayUTC(), provider };
  const update = { $inc: { requests: 1, tokens } };
  try {
    await org.updateOne("llmUsage", filter, update, { upsert: true });
  } catch (err) {
    if (!isDuplicateKeyError(err)) {
      throw err;
    }
    // Lost the upsert race: a concurrent first-of-day call for this
    // org+provider+day already inserted the row (the unique {orgId, date,
    // provider} index rejected our insert). The row now exists, so a plain
    // (non-upsert) update simply applies the increment.
    await org.updateOne("llmUsage", filter, update);
  }
}
