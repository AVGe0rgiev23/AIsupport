import type { Db, ObjectId } from "mongodb";

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getTodayUsage(db: Db, orgId: ObjectId): Promise<number> {
  const rows = await db
    .collection("llmUsage")
    .find({ orgId, date: todayUTC() })
    .toArray();
  return rows.reduce((sum, r) => sum + (r.requests as number), 0);
}

export async function incrementUsage(
  db: Db,
  orgId: ObjectId,
  provider: string,
  tokens: number,
): Promise<void> {
  await db.collection("llmUsage").updateOne(
    { orgId, date: todayUTC(), provider },
    { $inc: { requests: 1, tokens } },
    { upsert: true },
  );
}
