import { ObjectId } from 'mongodb';
import { z } from 'zod';

/**
 * User tier types - defines subscription level
 * - free: Default tier with limited features
 * - pro: Enhanced features and capabilities
 * - enterprise: Full feature access with priority support
 */
export type UserTier = 'free' | 'pro' | 'enterprise';

/**
 * Theme preference for the user interface
 */
export type Theme = 'light' | 'dark';

/**
 * User preferences configuration
 */
export interface UserPreferences {
  /** UI theme preference */
  theme: Theme;
  /** Default cluster ID to use for operations */
  defaultClusterId?: string;
}

/**
 * User document stored in MongoDB
 * Represents an authenticated user with subscription and preferences
 */
export interface User {
  /** MongoDB document ID */
  _id: ObjectId;
  /** Unique email address for authentication */
  email: string;
  /** User's full name */
  name: string;
  /** Organisation name */
  organisation: string;
  /** User's role in the organisation */
  roleInOrg: string;
  /** User's city */
  city: string;
  /** Current OTP code (SHA-256 hashed) - null when not set or expired */
  otpCode: string | null;
  /** OTP expiry timestamp - null when not set */
  otpExpiry: Date | null;
  /** Whether user has verified their email via OTP */
  otpVerified: boolean;
  /** Current subscription tier */
  tier: UserTier;
  /** Timestamp when free trial expires */
  freeTrialExpiresAt: Date;
  /** Account creation timestamp */
  createdAt: Date;
  /** User's customization preferences */
  preferences: UserPreferences;
}

/**
 * User data for client-side use (without sensitive fields)
 * Note: _id is string in client (serialized ObjectId from server)
 */
export type ClientUser = Omit<User, 'otpCode' | '_id'> & {
  _id: string;
};

/**
 * Zod schema for user preferences validation
 */
export const userPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark']),
  defaultClusterId: z.string().optional(),
});

/**
 * Zod schema for full user document validation
 * Note: ObjectId validation is handled as string in Zod
 */
export const userSchema = z.object({
  _id: z.instanceof(ObjectId),
  email: z.email(),
  name: z.string().min(1),
  organisation: z.string().min(1),
  roleInOrg: z.string().min(1),
  city: z.string().min(1),
  otpCode: z.string().nullable(),
  otpExpiry: z.date().nullable(),
  otpVerified: z.boolean(),
  tier: z.enum(['free', 'pro', 'enterprise']),
  freeTrialExpiresAt: z.date(),
  createdAt: z.date(),
  preferences: userPreferencesSchema,
});

/**
 * Zod schema for client-safe user data (without OTP code)
 */
export const clientUserSchema = userSchema.omit({ otpCode: true });

/**
 * Zod schema for user creation input
 */
export const createUserSchema = z.object({
  email: z.email(),
  fullName: z.string().min(1, 'Full name is required'),
  organisation: z.string().min(1, 'Organisation is required'),
  roleInOrg: z.string().min(1, 'Role is required'),
  city: z.string().min(1, 'City is required'),
});

/**
 * Zod schema for user update input
 */
export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  preferences: userPreferencesSchema.partial().optional(),
});

/**
 * Type for user creation input
 */
export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * Type for user update input
 */
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
