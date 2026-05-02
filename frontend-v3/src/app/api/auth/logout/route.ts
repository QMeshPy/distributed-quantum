/**
 * User Logout API Route
 *
 * POST /api/auth/logout - Log out current user
 * - Gets token from cookie
 * - Deletes session from database
 * - Clears session cookie
 * - Returns success message
 *
 * @see ARCHITECTURE.md lines 336-341
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/lib/auth/session';

/**
 * Logout response
 */
interface LogoutResponse {
  success: boolean;
  message: string;
}

/**
 * Error response format
 */
interface ErrorResponse {
  error: string;
}

/**
 * GET handler - not supported
 */
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

/**
 * POST handler - user logout
 *
 * Logs out the current user by:
 * 1. Retrieving session token from cookie
 * 2. Deleting session from database
 * 3. Clearing the session cookie
 * 4. Returning success response
 */
export async function POST(request: NextRequest) {
  try {
    // Get session token from cookie
    const token = request.cookies.get('session')?.value;

    if (!token) {
      // No session to log out from
      return NextResponse.json(
        {
          error: 'No active session',
        } satisfies ErrorResponse,
        { status: 401 },
      );
    }

    // Delete session from database
    await deleteSession(token);

    // Create response
    const response = NextResponse.json(
      {
        success: true,
        message: 'Logged out successfully',
      } satisfies LogoutResponse,
      { status: 200 },
    );

    // Clear session cookie
    response.cookies.delete('session');

    return response;
  } catch (error) {
    console.error('Logout error:', error);

    const message = error instanceof Error ? error.message : 'Internal server error';

    return NextResponse.json(
      {
        error: message,
      } satisfies ErrorResponse,
      { status: 500 },
    );
  }
}
