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
  /** Bcrypt-hashed password (cost factor 12) */
  passwordHash: string;
  /** User's display name */
  name: string;
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
 */
export type ClientUser = Omit<User, 'passwordHash'>;

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
  email: z.string().email(),
  passwordHash: z.string().min(1),
  name: z.string().min(1),
  tier: z.enum(['free', 'pro', 'enterprise']),
  freeTrialExpiresAt: z.date(),
  createdAt: z.date(),
  preferences: userPreferencesSchema,
});

/**
 * Zod schema for client-safe user data (without password)
 */
export const clientUserSchema = userSchema.omit({ passwordHash: true });

/**
 * Zod schema for user creation input
 */
export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
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
