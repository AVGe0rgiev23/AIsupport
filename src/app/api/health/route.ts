import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

// Public and unauthenticated, so it must write nothing: it used to insert a
// document per request, which let anyone fill the shared 512 MB M0 cluster by
// calling it in a loop (the risk the chat route's daily cap exists to stop).
// A ping proves the same thing: the app can reach the database.
export async function GET() {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
