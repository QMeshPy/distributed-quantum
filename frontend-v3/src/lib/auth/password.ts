/**
 * Password Utilities
 *
 * Secure password hashing and validation following ARCHITECTURE.md security requirements.
 * - Bcrypt cost factor 12 for password hashing
 * - Strong password policy enforced with Zod schema
 * - Minimum 12 characters with uppercase, lowercase, number, and special character
 *
 * @module lib/auth/password
 */

import bcrypt from 'bcryptjs';
import { z } from 'zod';

/**
 * Bcrypt cost factor for password hashing
 * Cost 12 provides strong security while maintaining reasonable performance
 * @see ARCHITECTURE.md lines 428-436
 */
const BCRYPT_COST_FACTOR = 12;

/**
 * Password validation schema
 *
 * Enforces strong password requirements per ARCHITECTURE.md:
 * - Minimum 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export const PasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

/**
 * Hash a password using bcrypt
 *
 * Uses bcrypt with cost factor 12 as specified in ARCHITECTURE.md.
 * The bcrypt algorithm automatically handles salting.
 *
 * @param password - Plain text password to hash
 * @returns Promise resolving to bcrypt hash string
 * @throws {Error} If hashing fails
 *
 * @example
 * ```ts
 * const hash = await hashPassword('SecureP@ssw0rd123');
 * // Returns: "$2a$12$..."
 * ```
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    const hash = await bcrypt.hash(password, BCRYPT_COST_FACTOR);
    return hash;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to hash password: ${message}`);
  }
}

/**
 * Verify a password against a bcrypt hash
 *
 * Compares the plain text password with the stored bcrypt hash.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param password - Plain text password to verify
 * @param hash - Bcrypt hash to compare against
 * @returns Promise resolving to true if password matches, false otherwise
 *
 * @example
 * ```ts
 * const isValid = await verifyPassword('SecureP@ssw0rd123', storedHash);
 * if (isValid) {
 *   // Password is correct
 * }
 * ```
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    // Log error but return false to prevent information leakage
    console.error('Password verification error:', error);
    return false;
  }
}

/**
 * Validate password strength
 *
 * Validates a password against the strong password requirements.
 * Returns validation result with detailed error messages.
 *
 * @param password - Password to validate
 * @returns Validation result with success flag and error messages
 *
 * @example
 * ```ts
 * const result = validatePassword('weak');
 * if (!result.success) {
 *   console.error(result.errors);
 *   // ["Password must be at least 12 characters", ...]
 * }
 * ```
 */
export function validatePassword(password: string): {
  success: boolean;
  errors: string[];
} {
  const result = PasswordSchema.safeParse(password);

  if (result.success) {
    return { success: true, errors: [] };
  }

  return {
    success: false,
    errors: result.error.errors.map((err) => err.message),
  };
}

/**
 * Validate and hash password in one operation
 *
 * Convenience function that validates password strength and hashes if valid.
 * Throws detailed validation errors if password doesn't meet requirements.
 *
 * @param password - Password to validate and hash
 * @returns Promise resolving to bcrypt hash
 * @throws {z.ZodError} If password doesn't meet requirements
 *
 * @example
 * ```ts
 * try {
 *   const hash = await validateAndHashPassword('SecureP@ssw0rd123');
 *   // Save hash to database
 * } catch (error) {
 *   if (error instanceof z.ZodError) {
 *     // Handle validation errors
 *   }
 * }
 * ```
 */
export async function validateAndHashPassword(password: string): Promise<string> {
  // This will throw ZodError if validation fails
  PasswordSchema.parse(password);
  return hashPassword(password);
}
