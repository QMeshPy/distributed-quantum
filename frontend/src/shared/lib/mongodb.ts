import "server-only";

import { MongoClient, type Db } from "mongodb";

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function getClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    return Promise.reject(
      new Error("MONGODB_URI is not set. Add it to your .env file."),
    );
  }

  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = new MongoClient(uri).connect();
    }
    return global._mongoClientPromise;
  }

  return new MongoClient(uri).connect();
}

let _promise: Promise<MongoClient> | null = null;

export default function getClient(): Promise<MongoClient> {
  if (!_promise) {
    _promise = getClientPromise();
  }
  return _promise;
}

export async function getDatabase(): Promise<Db> {
  const c = await getClient();
  return c.db(process.env.MONGODB_DB_NAME || "quantum_platform");
}
