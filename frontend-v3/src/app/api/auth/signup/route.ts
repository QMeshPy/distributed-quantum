/**
 * User Signup API Route
 *
 * POST /api/auth/signup - Register a new user with OTP verification
 * - Validates email, fullName, organisation, roleInOrg, city with Zod
 * - Verifies email doesn't already exist
 * - Generates 6-digit OTP and sends via Resend
 * - Creates user in MongoDB with unverified status
 * - Returns success message with email
 *
 * @see ARCHITECTURE.md lines 336-341
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { generateAndHashOTP, sendOTPEmail } from '@/lib/auth/otp';
import { env } from '@/lib/env';
import { getDB } from '@/lib/mongodb';
import type { User } from '@/types/user';

import type { NextRequest } from 'next/server';

/**
 * Signup request schema
 *
 * Validates user registration input including email and profile information.
 */
const signupSchema = z.object({
  email: z.email({ message: 'Invalid email address' }),
  fullName: z
    .string()
    .min(1, 'Full name is required')
    .max(100, 'Name must be 100 characters or less'),
  organisation: z
    .string()
    .min(1, 'Organisation is required')
    .max(100, 'Organisation must be 100 characters or less'),
  roleInOrg: z
    .string()
    .min(1, 'Role is required')
    .max(100, 'Role must be 100 characters or less'),
  city: z
    .string()
    .min(1, 'City is required')
    .max(100, 'City must be 100 characters or less'),
});

/**
 * Signup response
 */
interface SignupResponse {
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
 * POST handler - user registration with OTP
 *
 * Creates a new user account with the following steps:
 * 1. Validate input (email, fullName, organisation, roleInOrg, city)
 * 2. Verify email is not already registered
 * 3. Generate 6-digit OTP and hash it
 * 4. Send OTP via email
 * 5. Create user document in MongoDB with unverified status
 * 6. Return success message
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body: unknown = await request.json();
    const validationResult = signupSchema.safeParse(body);

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

    const { email, fullName, organisation, roleInOrg, city } =
      validationResult.data;

    // Get database connection
    const db = await getDB();

    // Check if email already exists
    const existingUser = await db
      .collection('users')
      .findOne({ email: email.toLowerCase() });

    if (existingUser !== null) {
      return NextResponse.json(
        {
          error: 'Email already registered',
        } satisfies ErrorResponse,
        { status: 409 },
      );
    }

    // Generate OTP
    const { code, hash, expiry } = generateAndHashOTP();

    // Send OTP via email
    try {
      await sendOTPEmail(email, code, fullName);
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

    // Calculate free trial expiration
    const freeTrialExpiresAt = new Date();
    freeTrialExpiresAt.setDate(
      freeTrialExpiresAt.getDate() + env.FREE_TRIAL_DAYS,
    );

    // Create user document
    const now = new Date();
    const userDoc: Omit<User, '_id'> = {
      email: email.toLowerCase(),
      name: fullName,
      organisation,
      roleInOrg,
      city,
      otpCode: hash,
      otpExpiry: expiry,
      otpVerified: false,
      tier: 'free',
      freeTrialExpiresAt,
      createdAt: now,
      preferences: {
        theme: 'light',
      },
    };

    await db.collection('users').insertOne(userDoc);

    // Return success response
    return NextResponse.json(
      {
        success: true,
        email: email.toLowerCase(),
        message:
          'Verification code sent to your email. Please check your inbox.',
      } satisfies SignupResponse,
      { status: 201 },
    );
  } catch (error: unknown) {
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
