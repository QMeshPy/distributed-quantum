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
  _id: z.custom<ObjectId>((val) => val instanceof ObjectId),
  userId: z.custom<ObjectId>((val) => val instanceof ObjectId),
  token: z.string().min(1),
  expiresAt: z.date(),
  createdAt: z.date(),
  userAgent: z.string(),
  ipAddress: z.string().refine(
    (val) => {
      // IPv4 or IPv6 validation
      const ipv4Regex =
        /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
      return ipv4Regex.test(val) || ipv6Regex.test(val);
    },
    { message: 'Invalid IP address' },
  ),
});

/**
 * Zod schema for session creation input
 */
export const createSessionSchema = z.object({
  userId: z.custom<ObjectId>((val) => val instanceof ObjectId),
  token: z.string().min(1),
  expiresAt: z.date(),
  userAgent: z.string(),
  ipAddress: z.string().refine(
    (val) => {
      // IPv4 or IPv6 validation
      const ipv4Regex =
        /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
      return ipv4Regex.test(val) || ipv6Regex.test(val);
    },
    { message: 'Invalid IP address' },
  ),
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
  _id: z.custom<ObjectId>((val) => val instanceof ObjectId),
  userId: z.custom<ObjectId>((val) => val instanceof ObjectId),
  expiresAt: z.date(),
  createdAt: z.date(),
});
