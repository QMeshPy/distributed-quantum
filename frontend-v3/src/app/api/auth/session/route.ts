/**
 * Session API Route
 *
 * GET /api/auth/session - Get current session and user
 * - Gets token from cookie
 * - Verifies JWT token
 * - Retrieves session from database
 * - Returns user if valid session exists
 * - Returns null if session is invalid or expired
 *
 * @see ARCHITECTURE.md lines 336-341
 */

import { NextResponse } from 'next/server';

import { verifyToken } from '@/lib/auth/jwt';
import { getSession } from '@/lib/auth/session';
import { getDB } from '@/lib/mongodb';
import type { User, ClientUser } from '@/types/user';

import type { NextRequest } from 'next/server';

/**
 * Session response with user data
 */
interface SessionResponse {
  user: ClientUser | null;
}

/**
 * Error response format
 */
interface ErrorResponse {
  error: string;
}

/**
 * POST handler - not supported
 */
export function POST(): NextResponse {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

/**
 * GET handler - retrieve current session
 *
 * Retrieves the current user session by:
 * 1. Getting session token from cookie
 * 2. Verifying JWT token signature and expiration
 * 3. Looking up session in database
 * 4. Fetching user data
 * 5. Returning user (without passwordHash) if valid
 * 6. Returning null if session is invalid or expired
 */
export async function GET(request: NextRequest) {
  try {
    // Get session token from cookie
    const token = request.cookies.get('session')?.value;

    if (token === undefined || token === '') {
      // No session cookie
      return NextResponse.json(
        {
          user: null,
        } satisfies SessionResponse,
        { status: 200 },
      );
    }

    // Verify JWT token
    const payload = await verifyToken(token);

    if (payload === null) {
      // Invalid or expired JWT
      return NextResponse.json(
        {
          user: null,
        } satisfies SessionResponse,
        { status: 200 },
      );
    }

    // Get session from database
    const session = await getSession(token);

    if (session === null) {
      // Session not found or expired
      return NextResponse.json(
        {
          user: null,
        } satisfies SessionResponse,
        { status: 200 },
      );
    }

    // Get database connection
    const db = await getDB();

    // Fetch user data
    const user = await db.collection<User>('users').findOne({
      _id: session.userId,
    });

    if (user === null) {
      // User not found (should not happen)
      return NextResponse.json(
        {
          user: null,
        } satisfies SessionResponse,
        { status: 200 },
      );
    }

    // Prepare response user (without otpCode)
    // Convert ObjectId to string for client
    const responseUser: ClientUser = {
      _id: user._id.toString(),
      email: user.email,
      name: user.name,
      organisation: user.organisation,
      roleInOrg: user.roleInOrg,
      city: user.city,
      otpExpiry: user.otpExpiry,
      otpVerified: user.otpVerified,
      tier: user.tier,
      freeTrialExpiresAt: user.freeTrialExpiresAt,
      createdAt: user.createdAt,
      preferences: user.preferences,
    };

    return NextResponse.json(
      {
        user: responseUser,
      } satisfies SessionResponse,
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error('Session retrieval error:', error);

    const message =
      error instanceof Error ? error.message : 'Internal server error';

    return NextResponse.json(
      {
        error: message,
      } satisfies ErrorResponse,
      { status: 500 },
    );
  }
}
