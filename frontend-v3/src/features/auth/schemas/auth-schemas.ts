/**
 * Authentication Validation Schemas
 *
 * Zod schemas for validating authentication-related data.
 * Extracted from form components for reusability.
 */

import { z } from 'zod';

/**
 * Email validation schema
 * Used in login flow (step 1)
 */
export const emailSchema = z.object({
  email: z.string().email('Invalid email address'),
});

/**
 * User details validation schema
 * Used in signup flow (step 1)
 */
export const userDetailsSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  organisation: z.string().min(1, 'Organisation is required'),
  role: z.string().min(1, 'Role is required'),
  city: z.string().min(1, 'City is required'),
  email: z.string().email('Invalid email address'),
});

/**
 * OTP verification schema
 * Used in both login and signup flows (step 2)
 */
export const otpSchema = z.object({
  email: z.string().email('Invalid email address'),
  otp: z
    .string()
    .length(6, 'OTP must be 6 digits')
    .regex(/^\d+$/, 'OTP must contain only numbers'),
});

/**
 * Type exports for form data
 */
export type EmailFormData = z.infer<typeof emailSchema>;
export type UserDetailsData = z.infer<typeof userDetailsSchema>;
export type OtpFormData = z.infer<typeof otpSchema>;
