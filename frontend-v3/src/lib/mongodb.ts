/**
 * MongoDB Connection Utility
 *
 * Implements singleton pattern for connection pooling following Next.js best practices.
 * Ensures only one connection is maintained across hot reloads in development.
 *
 * @module lib/mongodb
 * @see https://github.com/vercel/next.js/tree/canary/examples/with-mongodb
 */

import { MongoClient, Db, MongoClientOptions } from 'mongodb';
import { env } from '@/lib/env';

/**
 * MongoDB client options
 *
 * Optimized for serverless environments with connection pooling.
 */
const options: MongoClientOptions = {
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

/**
 * Global MongoDB client cache
 *
 * In development, use a global variable to preserve the client across hot reloads.
 * In production, the module cache handles this naturally.
 */
declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let clientPromise: Promise<MongoClient>;

/**
 * Initialize MongoDB client
 *
 * Creates a singleton MongoClient instance with connection pooling.
 * In development, the client is cached globally to survive hot reloads.
 *
 * @returns Promise that resolves to MongoClient instance
 */
function initializeClient(): Promise<MongoClient> {
  const client = new MongoClient(env.MONGODB_URI, options);

  return client.connect().catch((error) => {
    console.error('Failed to connect to MongoDB:', error);
    throw new Error(`MongoDB connection failed: ${error.message}`);
  });
}

// Initialize client based on environment
if (process.env.NODE_ENV === 'development') {
  // In development, use global variable to preserve connection across hot reloads
  if (!global._mongoClientPromise) {
    global._mongoClientPromise = initializeClient();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production, use module-level variable
  clientPromise = initializeClient();
}

/**
 * Get MongoDB client
 *
 * Returns the singleton MongoClient instance.
 * Connection is established lazily on first use.
 *
 * @returns Promise that resolves to MongoClient
 *
 * @example
 * ```ts
 * import { getClient } from '@/lib/mongodb';
 *
 * const client = await getClient();
 * const db = client.db();
 * const users = await db.collection('users').find().toArray();
 * ```
 */
export async function getClient(): Promise<MongoClient> {
  try {
    return await clientPromise;
  } catch (error) {
    console.error('Error getting MongoDB client:', error);
    throw error;
  }
}

/**
 * Get MongoDB database
 *
 * Returns the configured database instance from environment variables.
 * This is the primary method for accessing the database.
 *
 * @returns Promise that resolves to Db instance
 *
 * @example
 * ```ts
 * import { getDB } from '@/lib/mongodb';
 *
 * const db = await getDB();
 * const users = await db.collection('users').findOne({ email: 'user@example.com' });
 * ```
 */
export async function getDB(): Promise<Db> {
  try {
    const client = await clientPromise;
    return client.db(env.MONGODB_DATABASE);
  } catch (error) {
    console.error('Error getting MongoDB database:', error);
    throw error;
  }
}

/**
 * Connect to MongoDB
 *
 * Explicitly connects to MongoDB and returns the database instance.
 * Useful for initialization and health checks.
 *
 * @returns Promise that resolves to Db instance
 * @throws {Error} If connection fails
 *
 * @example
 * ```ts
 * import { connectDB } from '@/lib/mongodb';
 *
 * // In API route or server component
 * try {
 *   const db = await connectDB();
 *   console.log('Connected to MongoDB');
 * } catch (error) {
 *   console.error('Failed to connect:', error);
 * }
 * ```
 */
export async function connectDB(): Promise<Db> {
  try {
    const client = await clientPromise;
    const db = client.db(env.MONGODB_DATABASE);

    // Verify connection with a ping
    await db.admin().ping();

    return db;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('MongoDB connection error:', message);
    throw new Error(`Failed to connect to MongoDB: ${message}`);
  }
}

/**
 * Close MongoDB connection
 *
 * Closes the MongoDB connection. Only use this during application shutdown.
 * In serverless environments, you typically don't need to call this.
 *
 * @example
 * ```ts
 * import { closeConnection } from '@/lib/mongodb';
 *
 * // In shutdown handler
 * process.on('SIGTERM', async () => {
 *   await closeConnection();
 *   process.exit(0);
 * });
 * ```
 */
export async function closeConnection(): Promise<void> {
  try {
    const client = await clientPromise;
    await client.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
    throw error;
  }
}

/**
 * Check MongoDB connection health
 *
 * Performs a ping to verify the connection is healthy.
 * Useful for health check endpoints.
 *
 * @returns Promise that resolves to true if healthy, false otherwise
 *
 * @example
 * ```ts
 * import { checkHealth } from '@/lib/mongodb';
 *
 * // In health check API route
 * export async function GET() {
 *   const isHealthy = await checkHealth();
 *   return Response.json({ mongodb: isHealthy ? 'healthy' : 'unhealthy' });
 * }
 * ```
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const client = await clientPromise;
    const db = client.db(env.MONGODB_DATABASE);
    await db.admin().ping();
    return true;
  } catch (error) {
    console.error('MongoDB health check failed:', error);
    return false;
  }
}

/**
 * Export client promise for advanced use cases
 *
 * Most code should use getDB() or connectDB() instead.
 */
export { clientPromise };

/**
 * Re-export MongoDB types for convenience
 */
export type { Db, Collection, Document, WithId, OptionalId } from 'mongodb';
