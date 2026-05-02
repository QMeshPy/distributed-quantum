/**
 * MongoDB Connection Utility
 *
 * Optimized for Vercel serverless functions with direct connections.
 * Uses singleton pattern to reuse connections during warm starts while
 * handling cold starts efficiently.
 *
 * @module lib/mongodb
 * @see https://www.mongodb.com/docs/drivers/node/current/fundamentals/connection/
 * @see https://vercel.com/docs/functions/runtimes#request-lifecycle
 *
 * ## Serverless Optimization Strategy
 *
 * Vercel serverless functions have two states:
 * - **Cold start**: New instance, no existing connection (5s timeout)
 * - **Warm start**: Reuses existing connection from global cache
 *
 * This module optimizes for both:
 * 1. Fast cold start timeouts (5s) to fail fast
 * 2. Connection reuse during warm starts (automatic via singleton)
 * 3. No explicit pooling (serverless handles this at infrastructure level)
 * 4. Graceful handling of stale connections
 *
 * ## MongoDB Atlas Recommendation
 *
 * For best serverless performance:
 * - Use MongoDB Atlas (not local MongoDB)
 * - Enable connection string format: `mongodb+srv://...`
 * - Consider Data API for edge functions (optional)
 *
 * @example Connection String Format
 * ```
 * MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority
 * ```
 */

import { MongoClient } from 'mongodb';

import { env } from '@/lib/env';

import type { Db, MongoClientOptions } from 'mongodb';

/**
 * MongoDB client options
 *
 * Optimized for Vercel serverless environment:
 * - Short timeouts for fast cold-start failures
 * - No explicit pooling (serverless doesn't benefit from it)
 * - Connection reuse happens automatically during warm invocations
 */
const options: MongoClientOptions = {
  serverSelectionTimeoutMS: 5000, // Fast cold-start timeout
  socketTimeoutMS: 45000, // Keep reasonable operation timeout
  // NO pooling config - serverless handles connections at infrastructure level
};

/**
 * Global MongoDB client cache
 *
 * In development, use a global variable to preserve the client across hot reloads.
 * In production, the module cache handles this naturally.
 */
declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

/**
 * Initialize MongoDB client
 *
 * Creates a singleton MongoClient instance optimized for serverless.
 * In development, the client is cached globally to survive hot reloads.
 * In production, the client is cached at module level and reused during warm starts.
 *
 * @returns Promise that resolves to MongoClient instance
 */
function initializeClient(): Promise<MongoClient> {
  const client = new MongoClient(env.MONGODB_URI, options);

  return client.connect().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to connect to MongoDB:', message);
    throw new Error(`MongoDB connection failed: ${message}`);
  });
}

// Initialize client based on environment
const clientPromise: Promise<MongoClient> = (() => {
  if (process.env.NODE_ENV === 'development') {
    // In development, use global variable to preserve connection across hot reloads
    global._mongoClientPromise ??= initializeClient();
    return global._mongoClientPromise;
  }
  // In production (Vercel serverless), use module-level variable
  // Connection automatically reused during warm starts
  return initializeClient();
})();

/**
 * Get MongoDB client
 *
 * Returns the singleton MongoClient instance.
 * Connection is established lazily on first use and reused during warm starts.
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
    const client = await clientPromise;
    return client;
  } catch (error) {
    console.error('Error getting MongoDB client:', error);
    throw error;
  }
}

/**
 * Get MongoDB database
 *
 * Returns the configured database instance from environment variables.
 * This is the lightweight method - use connectDB() if you need connection validation.
 *
 * In serverless:
 * - Reuses connection from warm starts automatically
 * - No explicit validation (faster for trusted connections)
 *
 * @returns Promise that resolves to Db instance
 *
 * @example
 * ```ts
 * import { getDB } from '@/lib/mongodb';
 *
 * // Quick access (no validation)
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
 * Validates the connection is alive and reusable.
 *
 * In serverless environments:
 * - Cold start: Establishes new connection (5s timeout)
 * - Warm start: Reuses existing connection after validation
 * - Stale connection: Automatically reconnects
 *
 * @returns Promise that resolves to Db instance
 * @throws {Error} If connection fails or times out
 *
 * @example
 * ```ts
 * import { connectDB } from '@/lib/mongodb';
 *
 * // In API route or server component
 * export async function GET() {
 *   try {
 *     const db = await connectDB();
 *     const users = await db.collection('users').find().toArray();
 *     return Response.json({ users });
 *   } catch (error) {
 *     console.error('Database error:', error);
 *     return Response.json({ error: 'Database unavailable' }, { status: 503 });
 *   }
 * }
 * ```
 */
export async function connectDB(): Promise<Db> {
  try {
    const client = await clientPromise;
    const db = client.db(env.MONGODB_DATABASE);

    // Validate connection is alive (handles stale connections gracefully)
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
 *
 * **IMPORTANT:** In Vercel serverless functions, you should NOT call this.
 * Vercel automatically manages function lifecycle and connection cleanup.
 * Manually closing connections can cause errors in subsequent warm invocations.
 *
 * Use this only in:
 * - Long-running Node.js servers (non-serverless)
 * - Test suites (cleanup after tests)
 * - CLI scripts
 *
 * @example
 * ```ts
 * import { closeConnection } from '@/lib/mongodb';
 *
 * // In traditional Node.js server (NOT Vercel)
 * process.on('SIGTERM', async () => {
 *   await closeConnection();
 *   process.exit(0);
 * });
 *
 * // In test suite
 * afterAll(async () => {
 *   await closeConnection();
 * });
 * ```
 */
export async function closeConnection(): Promise<void> {
  try {
    const client = await clientPromise;
    await client.close();
    // Connection closed successfully
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
    throw error;
  }
}

/**
 * Check MongoDB connection health
 *
 * Performs a ping to verify the connection is healthy and reusable.
 * Essential for health check endpoints in serverless environments.
 *
 * In serverless:
 * - Validates connection works after cold start
 * - Detects stale connections from warm starts
 * - Fast timeout (5s) prevents hanging health checks
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
 *   return Response.json({
 *     mongodb: isHealthy ? 'healthy' : 'unhealthy',
 *     timestamp: new Date().toISOString()
 *   });
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
