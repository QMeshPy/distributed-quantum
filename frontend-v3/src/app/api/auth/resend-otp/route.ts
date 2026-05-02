/**
 * Resend OTP API Route
 *
 * POST /api/auth/resend-otp - Resend OTP code to user
 * - Validates email with Zod
 * - Finds user by email
 * - Generates new 6-digit OTP
 * - Sends OTP via email
 * - Updates user with new OTP hash and expiry
 * - Returns success message
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { generateAndHashOTP, sendOTPEmail } from '@/lib/auth/otp';
import { getDB } from '@/lib/mongodb';
import type { User } from '@/types/user';

import type { NextRequest } from 'next/server';

/**
 * Resend OTP request schema
 */
const resendOTPSchema = z.object({
  email: z.email({ message: 'Invalid email address' }),
});

/**
 * Resend OTP response
 */
interface ResendOTPResponse {
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
 * POST handler - resend OTP
 *
 * Resends OTP with the following steps:
 * 1. Validate input (email)
 * 2. Find user by email
 * 3. Generate new 6-digit OTP and hash it
 * 4. Send OTP via email
 * 5. Update user with new OTP hash and expiry
 * 6. Return success message
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body: unknown = await request.json();
    const validationResult = resendOTPSchema.safeParse(body);

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

    // Generate new OTP
    const { code, hash, expiry } = generateAndHashOTP();

    // Send OTP via email
    try {
      await sendOTPEmail(email, code, user.name);
    } catch (error: unknown) {
      console.error('Failed to send OTP email:', error);
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
        message: 'New verification code sent to your email.',
      } satisfies ResendOTPResponse,
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error('Resend OTP error:', error);

    const message =
      error instanceof Error ? error.message : 'Internal server error';

    return NextResponse.json(
      {
        error: 'Failed to resend OTP',
        details: [message],
      } satisfies ErrorResponse,
      { status: 500 },
    );
  }
}
