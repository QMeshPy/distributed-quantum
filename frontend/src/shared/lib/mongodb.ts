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

  if (process.env.NODE_ENV === "development" && global._mongoClientPromise) {
    return global._mongoClientPromise;
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  const connection = client.connect().catch(async (error) => {
    if (process.env.NODE_ENV === "development") global._mongoClientPromise = undefined;
    await client.close();
    throw error;
  });
  if (process.env.NODE_ENV === "development") global._mongoClientPromise = connection;
  return connection;
}

let _promise: Promise<MongoClient> | null = null;

export default function getClient(): Promise<MongoClient> {
  if (!_promise) {
    _promise = getClientPromise().catch((error) => {
      _promise = null;
      throw error;
    });
  }
  return _promise;
}

export async function getDatabase(): Promise<Db> {
  const c = await getClient();
  return c.db(process.env.MONGODB_DB_NAME || process.env.MONGODB_DATABASE || "quantum_platform");
}
