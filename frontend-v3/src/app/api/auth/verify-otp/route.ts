/**
 * OTP Verification API Route
 *
 * POST /api/auth/verify-otp - Verify OTP and create session
 * - Validates email and OTP code with Zod
 * - Finds user by email
 * - Verifies OTP code and checks expiry
 * - Marks user as verified
 * - Generates JWT token and creates session
 * - Sets HttpOnly cookie
 * - Returns user data
 *
 * @see ARCHITECTURE.md lines 336-341
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { verifyOTP, isOTPExpired } from '@/lib/auth/otp';
import { createSession } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { getDB } from '@/lib/mongodb';
import type { User, ClientUser } from '@/types/user';

import type { NextRequest } from 'next/server';

/**
 * Verify OTP request schema
 */
const verifyOTPSchema = z.object({
  email: z.email({ message: 'Invalid email address' }),
  otp: z
    .string()
    .length(6, 'OTP must be 6 digits')
    .regex(/^\d+$/, 'OTP must contain only numbers'),
});

/**
 * Verify OTP response with user and session
 */
interface VerifyOTPResponse {
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
export function GET(): NextResponse {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

/**
 * POST handler - OTP verification
 *
 * Verifies OTP with the following steps:
 * 1. Validate input (email, otp)
 * 2. Find user by email
 * 3. Check if OTP exists and hasn't expired
 * 4. Verify OTP code against stored hash
 * 5. Mark user as verified
 * 6. Clear OTP from database
 * 7. Generate JWT token and create session
 * 8. Set HttpOnly cookie with token
 * 9. Return user data (without OTP code)
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body: unknown = await request.json();
    const validationResult = verifyOTPSchema.safeParse(body);

    if (!validationResult.success) {
      const errors: string[] = validationResult.error.issues.map(
        (issue) => issue.message,
      );
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: errors,
        } satisfies ErrorResponse,
        { status: 400 },
      );
    }

    const { email, otp } = validationResult.data;

    // Get database connection
    const db = await getDB();

    // Find user by email
    const user = await db.collection<User>('users').findOne({
      email: email.toLowerCase(),
    });

    if (user === null) {
      return NextResponse.json(
        {
          error: 'Invalid email or OTP',
        } satisfies ErrorResponse,
        { status: 401 },
      );
    }

    // Check if OTP exists
    if (user.otpCode === null || user.otpExpiry === null) {
      return NextResponse.json(
        {
          error: 'No OTP found. Please request a new code.',
        } satisfies ErrorResponse,
        { status: 401 },
      );
    }

    // Check if OTP has expired
    if (isOTPExpired(user.otpExpiry)) {
      return NextResponse.json(
        {
          error: 'OTP has expired. Please request a new code.',
        } satisfies ErrorResponse,
        { status: 401 },
      );
    }

    // Verify OTP
    const isValid = verifyOTP(otp, user.otpCode);

    if (!isValid) {
      return NextResponse.json(
        {
          error: 'Invalid OTP code',
        } satisfies ErrorResponse,
        { status: 401 },
      );
    }

    // Mark user as verified and clear OTP
    await db.collection('users').updateOne(
      { email: email.toLowerCase() },
      {
        $set: {
          otpVerified: true,
          otpCode: null,
          otpExpiry: null,
        },
      },
    );

    // Update user object for session creation
    user.otpVerified = true;

    // Create session
    const userAgent = request.headers.get('user-agent') ?? 'unknown';
    const ipAddress =
      request.headers.get('x-forwarded-for') ??
      request.headers.get('x-real-ip') ??
      '0.0.0.0';

    const session = await createSession(
      user._id.toString(),
      userAgent,
      ipAddress,
    );

    // Prepare response user (without otpCode)
    // Convert ObjectId to string for client
    const responseUser: ClientUser = {
      _id: user._id.toString(),
      email: user.email,
      name: user.name,
      organisation: user.organisation,
      roleInOrg: user.roleInOrg,
      city: user.city,
      otpExpiry: null,
      otpVerified: user.otpVerified,
      tier: user.tier,
      freeTrialExpiresAt: user.freeTrialExpiresAt,
      createdAt: user.createdAt,
      preferences: user.preferences,
    };

    // Create response with cookie
    const response = NextResponse.json(
      {
        user: responseUser,
      } satisfies VerifyOTPResponse,
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
  } catch (error: unknown) {
    console.error('OTP verification error:', error);

    const message =
      error instanceof Error ? error.message : 'Internal server error';

    return NextResponse.json(
      {
        error: 'Verification failed',
        details: [message],
      } satisfies ErrorResponse,
      { status: 500 },
    );
  }
}
