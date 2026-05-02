/**
 * Session Management Utilities
 *
 * Manages user sessions stored in MongoDB.
 * - Creates session records with hashed tokens
 * - Retrieves sessions by token
 * - Deletes sessions on logout
 * - Uses SHA-256 to hash tokens before storing in DB
 *
 * @module lib/auth/session
 */

import { ObjectId } from 'mongodb';
import crypto from 'crypto';
import { getDB } from '@/lib/mongodb';
import type { Session } from '@/types/session';
import { generateToken, getTokenExpiration } from './jwt';

/**
 * Hash a token using SHA-256
 *
 * Tokens are hashed before storing in the database to prevent
 * token theft if the database is compromised.
 *
 * @param token - JWT token to hash
 * @returns Hex string of SHA-256 hash
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Create a new session
 *
 * Generates a JWT token, hashes it, and stores session record in MongoDB.
 * The unhashed token is returned to be set in an HttpOnly cookie.
 *
 * @param userId - User's MongoDB ObjectId as string
 * @param userAgent - User agent string from request headers
 * @param ipAddress - IP address of the client
 * @returns Promise resolving to Session record with unhashed token
 * @throws {Error} If session creation fails
 *
 * @example
 * ```ts
 * const session = await createSession(
 *   user._id.toString(),
 *   request.headers.get('user-agent') || 'unknown',
 *   request.headers.get('x-forwarded-for') || '0.0.0.0'
 * );
 * // Set session.token in HttpOnly cookie
 * ```
 */
export async function createSession(
  userId: string,
  userAgent: string,
  ipAddress: string,
): Promise<Session & { token: string }> {
  try {
    const db = await getDB();

    // Generate JWT token
    const token = await generateToken({
      userId,
      email: '', // Email will be filled from user document if needed
    });

    // Hash token for storage
    const hashedToken = hashToken(token);

    // Calculate expiration
    const expiresAt = getTokenExpiration();
    const createdAt = new Date();

    // Create session document
    const sessionDoc = {
      userId: new ObjectId(userId),
      token: hashedToken,
      expiresAt,
      createdAt,
      userAgent,
      ipAddress,
    };

    const result = await db.collection('sessions').insertOne(sessionDoc);

    // Return session with unhashed token
    return {
      _id: result.insertedId,
      userId: new ObjectId(userId),
      token, // Return unhashed token to set in cookie
      expiresAt,
      createdAt,
      userAgent,
      ipAddress,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to create session: ${message}`);
  }
}

/**
 * Get session by token
 *
 * Hashes the provided token and looks up the session in MongoDB.
 * Returns null if session not found or expired.
 *
 * @param token - JWT token from cookie
 * @returns Promise resolving to Session if valid, null otherwise
 *
 * @example
 * ```ts
 * const session = await getSession(token);
 * if (session) {
 *   // Session is valid
 *   console.log('User ID:', session.userId);
 * } else {
 *   // Session expired or invalid
 * }
 * ```
 */
export async function getSession(token: string): Promise<Session | null> {
  try {
    const db = await getDB();
    const hashedToken = hashToken(token);

    const session = await db.collection<Session>('sessions').findOne({
      token: hashedToken,
      expiresAt: { $gt: new Date() }, // Only return non-expired sessions
    });

    return session;
  } catch (error) {
    console.error('Error retrieving session:', error);
    return null;
  }
}

/**
 * Get session by user ID
 *
 * Retrieves all active sessions for a given user.
 * Useful for listing user's active sessions or session management.
 *
 * @param userId - User's MongoDB ObjectId as string
 * @returns Promise resolving to array of Sessions
 *
 * @example
 * ```ts
 * const sessions = await getSessionsByUserId(userId);
 * console.log(`User has ${sessions.length} active sessions`);
 * ```
 */
export async function getSessionsByUserId(userId: string): Promise<Session[]> {
  try {
    const db = await getDB();

    const sessions = await db
      .collection<Session>('sessions')
      .find({
        userId: new ObjectId(userId),
        expiresAt: { $gt: new Date() }, // Only return non-expired sessions
      })
      .toArray();

    return sessions;
  } catch (error) {
    console.error('Error retrieving sessions by user ID:', error);
    return [];
  }
}

/**
 * Delete session (logout)
 *
 * Hashes the token and removes the session from MongoDB.
 * Used during logout to invalidate the session.
 *
 * @param token - JWT token from cookie
 * @returns Promise resolving when session is deleted
 *
 * @example
 * ```ts
 * await deleteSession(token);
 * // Clear session cookie
 * cookies().delete('session');
 * ```
 */
export async function deleteSession(token: string): Promise<void> {
  try {
    const db = await getDB();
    const hashedToken = hashToken(token);

    await db.collection('sessions').deleteOne({
      token: hashedToken,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to delete session: ${message}`);
  }
}

/**
 * Delete all sessions for a user
 *
 * Removes all sessions for a given user ID.
 * Useful for "logout from all devices" functionality or account security.
 *
 * @param userId - User's MongoDB ObjectId as string
 * @returns Promise resolving to number of sessions deleted
 *
 * @example
 * ```ts
 * const count = await deleteAllUserSessions(userId);
 * console.log(`Deleted ${count} sessions`);
 * ```
 */
export async function deleteAllUserSessions(userId: string): Promise<number> {
  try {
    const db = await getDB();

    const result = await db.collection('sessions').deleteMany({
      userId: new ObjectId(userId),
    });

    return result.deletedCount;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to delete user sessions: ${message}`);
  }
}

/**
 * Clean up expired sessions
 *
 * Removes all expired sessions from the database.
 * Should be run periodically (e.g., via cron job or scheduled task).
 *
 * @returns Promise resolving to number of sessions deleted
 *
 * @example
 * ```ts
 * // In a scheduled task
 * const count = await cleanupExpiredSessions();
 * console.log(`Cleaned up ${count} expired sessions`);
 * ```
 */
export async function cleanupExpiredSessions(): Promise<number> {
  try {
    const db = await getDB();

    const result = await db.collection('sessions').deleteMany({
      expiresAt: { $lte: new Date() }, // Delete sessions that have expired
    });

    return result.deletedCount;
  } catch (error) {
    console.error('Error cleaning up expired sessions:', error);
    return 0;
  }
}

/**
 * Update session last activity
 *
 * Updates the session's last activity timestamp.
 * Can be used to implement sliding session expiration.
 *
 * @param token - JWT token from cookie
 * @returns Promise resolving to true if updated, false otherwise
 *
 * @example
 * ```ts
 * // On each authenticated request
 * await updateSessionActivity(token);
 * ```
 */
export async function updateSessionActivity(token: string): Promise<boolean> {
  try {
    const db = await getDB();
    const hashedToken = hashToken(token);

    const result = await db.collection('sessions').updateOne(
      {
        token: hashedToken,
        expiresAt: { $gt: new Date() },
      },
      {
        $set: {
          lastActivityAt: new Date(),
        },
      },
    );

    return result.modifiedCount > 0;
  } catch (error) {
    console.error('Error updating session activity:', error);
    return false;
  }
}
