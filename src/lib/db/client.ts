import { MongoClient, type Db } from "mongodb";

declare global {
  // Reuse one client across Next.js hot reloads / route invocations
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

export function getClientPromise(): Promise<MongoClient> {
  if (!globalThis._mongoClientPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set");
    const promise = new MongoClient(uri).connect();
    // A failed connect() must not poison this warm serverless instance forever:
    // clear the cache on rejection so the next call gets a fresh attempt.
    promise.catch(() => {
      if (globalThis._mongoClientPromise === promise) {
        globalThis._mongoClientPromise = undefined;
      }
    });
    globalThis._mongoClientPromise = promise;
  }
  return globalThis._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db("supportai");
}
