/**
 * JWT Token Utilities
 *
 * JWT token generation and verification using jose library (edge-runtime compatible).
 * Follows ARCHITECTURE.md security requirements:
 * - 256-bit JWT secret minimum (64 hex characters)
 * - HS256 algorithm
 * - HttpOnly cookies (NEVER localStorage)
 * - Token expiration per JWT_EXPIRES_IN env var
 *
 * @module lib/auth/jwt
 * @see ARCHITECTURE.md lines 439-451
 */

import { SignJWT, jwtVerify } from 'jose';

import { env } from '@/lib/env';

/**
 * JWT payload structure
 *
 * Contains user identification data stored in the token.
 * Keep minimal - only data needed for every request.
 */
export interface JWTPayload {
  /** User's MongoDB ObjectId as string */
  userId: string;
  /** User's email address */
  email: string;
}

/**
 * Convert JWT_EXPIRES_IN string to seconds
 *
 * Supports formats like: "7d", "24h", "60m", "3600" (seconds)
 * Defaults to 7 days if parsing fails.
 *
 * @param expiresIn - Expiration string from env variable
 * @returns Number of seconds until expiration
 */
function parseExpiresIn(expiresIn: string): number {
  const match = /^(\d+)([dhms])?$/.exec(expiresIn);

  if (match === null || match === undefined) {
    console.warn(
      `Invalid JWT_EXPIRES_IN format: ${expiresIn}, defaulting to 7 days`,
    );
    return 7 * 24 * 60 * 60; // 7 days in seconds
  }

  const value = parseInt(match[1], 10);
  const unit = match[2] !== '' && match[2] !== undefined ? match[2] : 's'; // Default to seconds if no unit

  switch (unit) {
    case 'd':
      return value * 24 * 60 * 60; // days to seconds
    case 'h':
      return value * 60 * 60; // hours to seconds
    case 'm':
      return value * 60; // minutes to seconds
    case 's':
      return value; // already seconds
    default:
      return 7 * 24 * 60 * 60; // fallback to 7 days
  }
}

/**
 * Get JWT secret as Uint8Array
 *
 * Converts hex string secret to bytes for jose library.
 * Validates minimum length (64 hex chars = 32 bytes = 256 bits).
 *
 * @returns JWT secret as Uint8Array
 * @throws {Error} If secret is too short
 */
function getSecretKey(): Uint8Array {
  const secret = env.JWT_SECRET;

  // Validate secret length (already validated by env.ts, but double-check)
  if (secret.length < 64) {
    throw new Error(
      'JWT_SECRET must be at least 64 hexadecimal characters (256 bits). Generate with: openssl rand -hex 32',
    );
  }

  // Convert hex string to bytes
  return new TextEncoder().encode(secret);
}

/**
 * Generate JWT token
 *
 * Creates a signed JWT token containing user identification data.
 * Uses HS256 algorithm with 256-bit secret.
 * Token expires per JWT_EXPIRES_IN environment variable.
 *
 * @param payload - User data to encode in token
 * @returns Promise resolving to signed JWT string
 * @throws {Error} If token generation fails
 *
 * @example
 * ```ts
 * const token = await generateToken({
 *   userId: user._id.toString(),
 *   email: user.email
 * });
 * // Set token in HttpOnly cookie
 * ```
 */
export async function generateToken(payload: JWTPayload): Promise<string> {
  try {
    const secret = getSecretKey();
    const expiresInSeconds = parseExpiresIn(env.JWT_EXPIRES_IN);

    const token = await new SignJWT({ ...payload })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
      .sign(secret);

    return token;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to generate JWT token: ${message}`);
  }
}

/**
 * Verify JWT token
 *
 * Verifies token signature and expiration, then extracts payload.
 * Returns null if token is invalid or expired.
 *
 * @param token - JWT token string to verify
 * @returns Promise resolving to payload if valid, null if invalid
 *
 * @example
 * ```ts
 * const payload = await verifyToken(token);
 * if (payload) {
 *   console.log('User ID:', payload.userId);
 * } else {
 *   // Token invalid or expired
 * }
 * ```
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const secret = getSecretKey();

    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
    });

    // Validate payload structure
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.email !== 'string' ||
      payload.userId === '' ||
      payload.email === ''
    ) {
      console.error('Invalid JWT payload structure:', payload);
      return null;
    }

    return {
      userId: payload.userId,
      email: payload.email,
    };
  } catch (error) {
    // Log error for debugging but return null to prevent information leakage
    if (error instanceof Error) {
      // Common errors: token expired, invalid signature, malformed token
      console.error('JWT verification failed:', error.message);
    }
    return null;
  }
}

/**
 * Get token expiration date
 *
 * Calculates the expiration date for a new token based on JWT_EXPIRES_IN.
 * Useful for setting cookie maxAge and session expiresAt.
 *
 * @returns Date object representing when a new token would expire
 *
 * @example
 * ```ts
 * const expiresAt = getTokenExpiration();
 * // Use for session.expiresAt in database
 * ```
 */
export function getTokenExpiration(): Date {
  const expiresInSeconds = parseExpiresIn(env.JWT_EXPIRES_IN);
  return new Date(Date.now() + expiresInSeconds * 1000);
}

/**
 * Get token expiration in seconds
 *
 * Returns the number of seconds until token expiration.
 * Useful for setting cookie maxAge.
 *
 * @returns Number of seconds until expiration
 *
 * @example
 * ```ts
 * const maxAge = getTokenExpirationSeconds();
 * cookies().set('session', token, { maxAge });
 * ```
 */
export function getTokenExpirationSeconds(): number {
  return parseExpiresIn(env.JWT_EXPIRES_IN);
}
