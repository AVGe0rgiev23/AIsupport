import { config } from "dotenv";
config({ path: ".env.local" });

import { MongoClient } from "mongodb";
import { ensureIndexes } from "../src/lib/db/indexes";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  const client = await MongoClient.connect(uri);
  await ensureIndexes(client.db("supportai"));
  console.log("Indexes ensured.");
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
