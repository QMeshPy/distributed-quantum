/**
 * User Login API Route
 *
 * POST /api/auth/login - Authenticate existing user with OTP
 * - Validates email with Zod
 * - Finds user by email
 * - Generates 6-digit OTP and sends via email
 * - Returns success message
 *
 * @see ARCHITECTURE.md lines 336-341
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { generateAndHashOTP, sendOTPEmail } from '@/lib/auth/otp';
import { getDB } from '@/lib/mongodb';
import type { User } from '@/types/user';

import type { NextRequest } from 'next/server';

/**
 * Login request schema
 *
 * Validates user login credentials (email only for OTP-based auth).
 */
const loginSchema = z.object({
  email: z.email({ message: 'Invalid email address' }),
});

/**
 * Login response
 */
interface LoginResponse {
  success: boolean;
  email: string;
  message: string;
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
 * POST handler - user authentication with OTP
 *
 * Authenticates a user with the following steps:
 * 1. Validate input (email)
 * 2. Find user by email in database
 * 3. Generate 6-digit OTP and hash it
 * 4. Send OTP via email
 * 5. Update user with OTP hash and expiry
 * 6. Return success message
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body: unknown = await request.json();
    const validationResult = loginSchema.safeParse(body);

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

    const { email } = validationResult.data;

    // Get database connection
    const db = await getDB();

    // Find user by email
    const user = await db.collection<User>('users').findOne({
      email: email.toLowerCase(),
    });

    if (user === null) {
      // Don't reveal whether email exists
      return NextResponse.json(
        {
          error: 'Invalid email address',
        } satisfies ErrorResponse,
        { status: 401 },
      );
    }

    // Generate OTP
    const { code, hash, expiry } = generateAndHashOTP();

    // Send OTP via email
    try {
      await sendOTPEmail(email, code, user.name);
    } catch (emailError: unknown) {
      console.error('Failed to send OTP email:', emailError);
      return NextResponse.json(
        {
          error: 'Failed to send verification email',
          details: ['Please try again later'],
        } satisfies ErrorResponse,
        { status: 500 },
      );
    }

    // Update user with new OTP
    await db.collection('users').updateOne(
      { email: email.toLowerCase() },
      {
        $set: {
          otpCode: hash,
          otpExpiry: expiry,
        },
      },
    );

    // Return success response
    return NextResponse.json(
      {
        success: true,
        email: email.toLowerCase(),
        message:
          'Verification code sent to your email. Please check your inbox.',
      } satisfies LoginResponse,
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error('Login error:', error);

    const message =
      error instanceof Error ? error.message : 'Internal server error';

    return NextResponse.json(
      {
        error: 'Login failed',
        details: [message],
      } satisfies ErrorResponse,
      { status: 500 },
    );
  }
}
