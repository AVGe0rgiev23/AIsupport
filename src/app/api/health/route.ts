import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    await db.collection("healthchecks").insertOne({ at: new Date() });
    const count = await db.collection("healthchecks").countDocuments();
    return Response.json({ ok: true, healthchecks: count });
  } catch (err) {
    return Response.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
