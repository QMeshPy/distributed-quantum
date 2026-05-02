/**
 * User Signup API Route
 *
 * POST /api/auth/signup - Register a new user
 * - Validates email/password/name with Zod
 * - Checks password requirements (PasswordSchema)
 * - Verifies email doesn't already exist
 * - Hashes password (bcrypt cost 12)
 * - Creates user in MongoDB
 * - Sets freeTrialExpiresAt based on FREE_TRIAL_DAYS
 * - Generates JWT token
 * - Creates session in database
 * - Sets HttpOnly cookie
 * - Returns user (without passwordHash)
 *
 * @see ARCHITECTURE.md lines 336-341
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDB } from '@/lib/mongodb';
import { env } from '@/lib/env';
import { validateAndHashPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import type { User, ClientUser } from '@/types/user';

/**
 * Signup request schema
 *
 * Validates user registration input including email, password, and name.
 * Password validation delegates to PasswordSchema (min 12 chars, complexity requirements).
 */
const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string(), // Will be validated by validateAndHashPassword
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less'),
});

/**
 * Signup response with user and session
 */
interface SignupResponse {
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
 * POST handler - user registration
 *
 * Creates a new user account with the following steps:
 * 1. Validate input (email, password, name)
 * 2. Check password complexity requirements
 * 3. Verify email is not already registered
 * 4. Hash password with bcrypt cost 12
 * 5. Create user document in MongoDB
 * 6. Generate JWT token and create session
 * 7. Set HttpOnly cookie with token
 * 8. Return user data (without password hash)
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validationResult = signupSchema.safeParse(body);

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

    const { email, password, name } = validationResult.data;

    // Get database connection
    const db = await getDB();

    // Check if email already exists
    const existingUser = await db
      .collection('users')
      .findOne({ email: email.toLowerCase() });

    if (existingUser) {
      return NextResponse.json(
        {
          error: 'Email already registered',
        } satisfies ErrorResponse,
        { status: 409 },
      );
    }

    // Validate and hash password (throws if validation fails)
    let passwordHash: string;
    try {
      passwordHash = await validateAndHashPassword(password);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map((err) => err.message);
        return NextResponse.json(
          {
            error: 'Password does not meet requirements',
            details: errors,
          } satisfies ErrorResponse,
          { status: 400 },
        );
      }
      throw error;
    }

    // Calculate free trial expiration
    const freeTrialExpiresAt = new Date();
    freeTrialExpiresAt.setDate(
      freeTrialExpiresAt.getDate() + env.FREE_TRIAL_DAYS,
    );

    // Create user document
    const now = new Date();
    const userDoc: Omit<User, '_id'> = {
      email: email.toLowerCase(),
      passwordHash,
      name,
      tier: 'free',
      freeTrialExpiresAt,
      createdAt: now,
      preferences: {
        theme: 'light',
      },
    };

    const result = await db.collection('users').insertOne(userDoc);

    // Create session
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const ipAddress =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      '0.0.0.0';

    const session = await createSession(
      result.insertedId.toString(),
      userAgent,
      ipAddress,
    );

    // Prepare response user (without passwordHash)
    const responseUser: ClientUser = {
      _id: result.insertedId,
      email: userDoc.email,
      name: userDoc.name,
      tier: userDoc.tier,
      freeTrialExpiresAt: userDoc.freeTrialExpiresAt,
      createdAt: userDoc.createdAt,
      preferences: userDoc.preferences,
    };

    // Create response with cookie
    const response = NextResponse.json(
      {
        user: responseUser,
      } satisfies SignupResponse,
      { status: 201 },
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
    console.error('Signup error:', error);

    const message =
      error instanceof Error ? error.message : 'Internal server error';

    return NextResponse.json(
      {
        error: 'Signup failed',
        details: [message],
      } satisfies ErrorResponse,
      { status: 500 },
    );
  }
}
