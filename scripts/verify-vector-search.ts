import { config } from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import { EMBEDDING_DIMS } from "../src/lib/ai/embeddings";
import { searchChunks } from "../src/lib/db/vectorSearch";

config({ path: ".env.local" });

function basisVector(i: number): number[] {
  const v = new Array(EMBEDDING_DIMS).fill(0);
  v[i] = 1;
  return v;
}

async function main() {
  const client = await MongoClient.connect(process.env.MONGODB_URI!);
  const db = client.db("supportai");
  const chunks = db.collection("chunks");
  const orgA = new ObjectId();
  const orgB = new ObjectId();
  const marker = `verify-vector-${Date.now()}`;

  await chunks.insertMany([
    { orgId: orgA, documentId: new ObjectId(), text: `${marker} orgA refunds`, embedding: basisVector(0), heading: null, position: 0 },
    { orgId: orgA, documentId: new ObjectId(), text: `${marker} orgA shipping`, embedding: basisVector(1), heading: null, position: 1 },
    { orgId: orgB, documentId: new ObjectId(), text: `${marker} orgB secret`, embedding: basisVector(0), heading: null, position: 0 },
  ]);

  try {
    // Search indexes build asynchronously — poll until our docs are visible.
    let hits: Awaited<ReturnType<typeof searchChunks>> = [];
    for (let attempt = 0; attempt < 24; attempt++) {
      hits = await searchChunks(db, orgA, basisVector(0), 5);
      if (hits.some((h) => h.text.startsWith(marker))) break;
      await new Promise((r) => setTimeout(r, 5000));
    }

    const texts = hits.map((h) => h.text).filter((t) => t.startsWith(marker));
    if (texts.length === 0) throw new Error("No results — is chunks_vector_index Active?");
    if (texts[0] !== `${marker} orgA refunds`) throw new Error(`Wrong top hit: ${texts[0]}`);
    if (texts.some((t) => t.includes("orgB"))) throw new Error("ISOLATION BREACH: orgB doc visible to orgA");
    console.log("vector search OK — top hit correct, orgB invisible to orgA");
  } finally {
    await chunks.deleteMany({ text: { $regex: `^${marker}` } });
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
