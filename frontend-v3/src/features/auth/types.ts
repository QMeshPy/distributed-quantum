/**
 * Authentication Feature Types
 *
 * Type definitions for authentication-related data structures.
 */

import type { ClientUser, UserTier } from '@/types/user';

/**
 * API Response types
 */
export interface ApiErrorResponse {
  error?: {
    message?: string;
  };
}

export interface VerifyOtpResponse {
  user: {
    _id: string;
    email: string;
    name: string;
    organisation?: string;
    roleInOrg?: string;
    city?: string;
    otpExpiry?: string;
    otpVerified?: boolean;
    tier: UserTier;
    freeTrialExpiresAt: string;
    createdAt: string;
    preferences?: {
      theme?: 'light' | 'dark';
      defaultClusterId?: string;
    };
  };
}

export interface SendOtpResponse {
  success: boolean;
  email: string;
  message: string;
}

export interface SessionResponse {
  user: ClientUser;
}

/**
 * Validation error type
 */
export interface ValidationError {
  path: (string | number)[];
  message: string;
}
