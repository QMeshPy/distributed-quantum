import { ObjectId } from 'mongodb';
import { z } from 'zod';

/**
 * Session document stored in MongoDB
 * Represents an authenticated user session with JWT token
 */
export interface Session {
  /** MongoDB document ID */
  _id: ObjectId;
  /** Reference to the user who owns this session */
  userId: ObjectId;
  /** Hashed JWT token for verification */
  token: string;
  /** Session expiration timestamp (TTL index) */
  expiresAt: Date;
  /** Session creation timestamp */
  createdAt: Date;
  /** User agent string from the client */
  userAgent: string;
  /** IP address of the client */
  ipAddress: string;
}

/**
 * Zod schema for session document validation
 */
export const sessionSchema = z.object({
  _id: z.instanceof(ObjectId),
  userId: z.instanceof(ObjectId),
  token: z.string().min(1),
  expiresAt: z.date(),
  createdAt: z.date(),
  userAgent: z.string(),
  ipAddress: z.string().ip(),
});

/**
 * Zod schema for session creation input
 */
export const createSessionSchema = z.object({
  userId: z.instanceof(ObjectId),
  token: z.string().min(1),
  expiresAt: z.date(),
  userAgent: z.string(),
  ipAddress: z.string().ip(),
});

/**
 * Type for session creation input
 */
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

/**
 * Session data returned to client (without sensitive token)
 */
export interface ClientSession {
  _id: ObjectId;
  userId: ObjectId;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Zod schema for client-safe session data
 */
export const clientSessionSchema = z.object({
  _id: z.instanceof(ObjectId),
  userId: z.instanceof(ObjectId),
  expiresAt: z.date(),
  createdAt: z.date(),
});
