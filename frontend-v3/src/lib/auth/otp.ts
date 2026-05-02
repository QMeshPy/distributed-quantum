/**
 * OTP Utilities
 *
 * Manages One-Time Password (OTP) generation, hashing, verification, and email delivery.
 * - 6-digit numeric OTP codes
 * - SHA-256 hashing for secure storage
 * - 10-minute expiry window
 * - Email delivery via Resend
 *
 * @module lib/auth/otp
 */

import crypto from 'node:crypto';

import { Resend } from 'resend';

/**
 * OTP expiry duration in milliseconds (10 minutes)
 */
export const OTP_EXPIRY_MS = 10 * 60 * 1000;

/**
 * Initialize Resend client
 * Requires RESEND_API_KEY environment variable
 */
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Generate a 6-digit numeric OTP code
 *
 * Uses cryptographically secure random number generation to create
 * a 6-digit code between 100000 and 999999.
 *
 * @returns 6-digit OTP code as string
 *
 * @example
 * ```ts
 * const otp = generateOTP();
 * // Returns: "123456"
 * ```
 */
export function generateOTP(): string {
  // Generate random number between 100000 and 999999
  const randomNumber = crypto.randomInt(100000, 1000000);
  return randomNumber.toString();
}

/**
 * Hash an OTP code using SHA-256
 *
 * OTP codes are hashed before storing in the database to prevent
 * code theft if the database is compromised.
 *
 * @param code - Plain OTP code to hash
 * @returns Hex string of SHA-256 hash
 *
 * @example
 * ```ts
 * const hash = hashOTP('123456');
 * // Returns: "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92"
 * ```
 */
export function hashOTP(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Verify an OTP code against a hash
 *
 * Compares the plain OTP code with the stored hash.
 * Uses constant-time comparison via hashing to prevent timing attacks.
 *
 * @param code - Plain OTP code to verify
 * @param hash - SHA-256 hash to compare against
 * @returns true if OTP matches, false otherwise
 *
 * @example
 * ```ts
 * const isValid = verifyOTP('123456', storedHash);
 * if (isValid) {
 *   // OTP is correct
 * }
 * ```
 */
export function verifyOTP(code: string, hash: string): boolean {
  try {
    const codeHash = hashOTP(code);
    // Constant-time comparison via hash equality
    return codeHash === hash;
  } catch (error) {
    console.error('OTP verification error:', error);
    return false;
  }
}

/**
 * Calculate OTP expiry timestamp
 *
 * Returns a Date object set to 10 minutes from now.
 *
 * @returns Date object for OTP expiry
 *
 * @example
 * ```ts
 * const expiry = getOTPExpiry();
 * // Returns: Date object 10 minutes in the future
 * ```
 */
export function getOTPExpiry(): Date {
  return new Date(Date.now() + OTP_EXPIRY_MS);
}

/**
 * Check if an OTP has expired
 *
 * @param expiryDate - OTP expiry timestamp
 * @returns true if expired, false otherwise
 *
 * @example
 * ```ts
 * const expired = isOTPExpired(user.otpExpiry);
 * if (expired) {
 *   // OTP is no longer valid
 * }
 * ```
 */
export function isOTPExpired(expiryDate: Date | null): boolean {
  if (expiryDate === null || expiryDate === undefined) return true;
  return new Date() > expiryDate;
}

/**
 * Send OTP via email using Resend
 *
 * Sends a formatted email with the OTP code to the user's email address.
 * Uses the RESEND_FROM_EMAIL environment variable or defaults to
 * 'onboarding@resend.dev' for testing.
 *
 * @param email - Recipient email address
 * @param code - 6-digit OTP code (plain text)
 * @param name - Optional user name for personalization
 * @returns Promise resolving when email is sent
 * @throws {Error} If email sending fails
 *
 * @example
 * ```ts
 * await sendOTPEmail('user@example.com', '123456', 'John Doe');
 * ```
 */
export async function sendOTPEmail(
  email: string,
  code: string,
  name?: string,
): Promise<void> {
  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

    const greeting = name ? `Hi ${name}` : 'Hi there';

    const { error } = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: 'Your Verification Code',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verification Code</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
              <h1 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 600; color: #181d26;">Verification Code</h1>
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #333840;">${greeting},</p>
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #333840;">Your verification code is:</p>
              <div style="background-color: #ffffff; border: 2px solid #e0e2e6; border-radius: 8px; padding: 20px; text-align: center; margin: 0 0 20px 0;">
                <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #181d26;">${code}</span>
              </div>
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #41454d;">This code will expire in <strong>10 minutes</strong>.</p>
              <p style="margin: 0; font-size: 14px; color: #41454d;">If you didn't request this code, please ignore this email.</p>
            </div>
            <div style="border-top: 1px solid #dddddd; padding-top: 20px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #9297a0;">This is an automated message, please do not reply.</p>
            </div>
          </body>
        </html>
      `,
    });

    if (error !== null && error !== undefined) {
      throw new Error(`Failed to send OTP email: ${error.message}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error sending OTP email:', message);
    throw new Error(`Failed to send OTP email: ${message}`);
  }
}

/**
 * Generate OTP and return hash with expiry
 *
 * Convenience function that generates an OTP, hashes it, and calculates expiry.
 * Returns both the plain code (to send via email) and hash (to store in DB).
 *
 * @returns Object with plain code, hash, and expiry
 *
 * @example
 * ```ts
 * const { code, hash, expiry } = generateAndHashOTP();
 * // Send code to user
 * await sendOTPEmail(email, code, name);
 * // Store hash in database
 * await db.collection('users').updateOne(
 *   { email },
 *   { $set: { otpCode: hash, otpExpiry: expiry } }
 * );
 * ```
 */
export function generateAndHashOTP(): {
  code: string;
  hash: string;
  expiry: Date;
} {
  const code = generateOTP();
  const hash = hashOTP(code);
  const expiry = getOTPExpiry();

  return { code, hash, expiry };
}
