/**
 * User Login API Route
 *
 * POST /api/auth/login - Authenticate existing user
 * - Validates email/password with Zod
 * - Finds user by email
 * - Verifies password with bcrypt
 * - Generates JWT token
 * - Creates new session in database
 * - Sets HttpOnly cookie with token
 * - Returns user (without passwordHash)
 *
 * @see ARCHITECTURE.md lines 336-341
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDB } from '@/lib/mongodb';
import { env } from '@/lib/env';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import type { User, ClientUser } from '@/types/user';

/**
 * Login request schema
 *
 * Validates user login credentials.
 */
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * Login response with user data
 */
interface LoginResponse {
  user: ClientUser;
}

/**
 * Error response format
 */
interface ErrorResponse {
  error: string;
  details?: string[];
}

/**
 * GET handler - not supported
 */
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

/**
 * POST handler - user authentication
 *
 * Authenticates a user with the following steps:
 * 1. Validate input (email, password)
 * 2. Find user by email in database
 * 3. Verify password against stored hash
 * 4. Generate JWT token and create session
 * 5. Set HttpOnly cookie with token
 * 6. Return user data (without password hash)
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validationResult = loginSchema.safeParse(body);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((err) => err.message);
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: errors,
        } satisfies ErrorResponse,
        { status: 400 },
      );
    }

    const { email, password } = validationResult.data;

    // Get database connection
    const db = await getDB();

    // Find user by email
    const user = await db.collection<User>('users').findOne({
      email: email.toLowerCase(),
    });

    if (!user) {
      // Don't reveal whether email exists
      return NextResponse.json(
        {
          error: 'Invalid email or password',
        } satisfies ErrorResponse,
        { status: 401 },
      );
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.passwordHash);

    if (!isPasswordValid) {
      return NextResponse.json(
        {
          error: 'Invalid email or password',
        } satisfies ErrorResponse,
        { status: 401 },
      );
    }

    // Create session
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '0.0.0.0';

    const session = await createSession(user._id.toString(), userAgent, ipAddress);

    // Prepare response user (without passwordHash)
    const responseUser: ClientUser = {
      _id: user._id,
      email: user.email,
      name: user.name,
      tier: user.tier,
      freeTrialExpiresAt: user.freeTrialExpiresAt,
      createdAt: user.createdAt,
      preferences: user.preferences,
    };

    // Create response with cookie
    const response = NextResponse.json(
      {
        user: responseUser,
      } satisfies LoginResponse,
      { status: 200 },
    );

    // Set HttpOnly cookie with session token
    response.cookies.set('session', session.token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);

    const message = error instanceof Error ? error.message : 'Internal server error';

    return NextResponse.json(
      {
        error: 'Login failed',
        details: [message],
      } satisfies ErrorResponse,
      { status: 500 },
    );
  }
}
