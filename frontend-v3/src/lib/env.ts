/**
 * Environment Variable Validation
 *
 * Validates all required environment variables on startup using Zod.
 * Throws clear errors for missing or invalid configuration.
 *
 * @module lib/env
 */

import { z } from 'zod';

/**
 * Environment variable schema
 *
 * Validates all required and optional environment variables.
 * Throws descriptive errors if validation fails.
 */
const envSchema = z.object({
  // Authentication
  JWT_SECRET: z
    .string()
    .min(
      64,
      'JWT_SECRET must be at least 64 hexadecimal characters (32 bytes). Generate with: openssl rand -hex 32',
    )
    .regex(
      /^[0-9a-fA-F]+$/,
      'JWT_SECRET must contain only hexadecimal characters',
    ),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Database
  MONGODB_URI: z
    .string()
    .min(1, 'MONGODB_URI is required')
    .refine(
      (uri) => uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://'),
      'MONGODB_URI must start with mongodb:// or mongodb+srv://',
    ),
  MONGODB_DATABASE: z
    .string()
    .min(1, 'MONGODB_DATABASE is required')
    .default('quantum_frontend'),

  // Free Tier Configuration
  FREE_TRIAL_DAYS: z.coerce.number().int().positive().default(14),
  MAX_CLUSTERS_FREE: z.coerce.number().int().positive().default(3),
  RATE_LIMIT_FREE_RPM: z.coerce.number().int().positive().default(100),

  // Environment & Security
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  DEV_MODE_BYPASS_AUTH: z
    .string()
    .optional()
    .default('false')
    .transform((val) => val === 'true')
    .refine(
      (val) => {
        // In production, DEV_MODE_BYPASS_AUTH must be false
        if (process.env.NODE_ENV === 'production' && val) {
          return false;
        }
        return true;
      },
      { message: 'DEV_MODE_BYPASS_AUTH must be false in production' },
    ),
  HTTPS_ONLY: z
    .string()
    .optional()
    .default('false')
    .transform((val) => val === 'true'),

  // Quantum Backend
  QUANTUM_BACKEND_URL: z
    .url('QUANTUM_BACKEND_URL must be a valid URL')
    .default('http://localhost:8000'),
});

/**
 * Validated environment variables
 *
 * Type-safe access to all environment variables.
 * Use this instead of process.env for guaranteed type safety.
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables
 *
 * @throws {z.ZodError} If validation fails with detailed error messages
 * @returns Validated environment object
 */
function parseEnv(): Env {
  try {
    return envSchema.parse({
      JWT_SECRET: process.env.JWT_SECRET,
      JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
      MONGODB_URI: process.env.MONGODB_URI,
      MONGODB_DATABASE: process.env.MONGODB_DATABASE,
      FREE_TRIAL_DAYS: process.env.FREE_TRIAL_DAYS,
      MAX_CLUSTERS_FREE: process.env.MAX_CLUSTERS_FREE,
      RATE_LIMIT_FREE_RPM: process.env.RATE_LIMIT_FREE_RPM,
      NODE_ENV: process.env.NODE_ENV,
      DEV_MODE_BYPASS_AUTH: process.env.DEV_MODE_BYPASS_AUTH,
      HTTPS_ONLY: process.env.HTTPS_ONLY,
      QUANTUM_BACKEND_URL: process.env.QUANTUM_BACKEND_URL,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Format validation errors for better readability
      const errorMessages = error.issues.map((err) => {
        const path = err.path.join('.');
        return `  - ${path}: ${err.message}`;
      });

      console.error('\n❌ Environment variable validation failed:\n');
      console.error(errorMessages.join('\n'));
      console.error(
        '\n💡 Copy .env.example to .env.local and configure all required variables.\n',
      );

      throw new Error('Invalid environment configuration');
    }
    throw error;
  }
}

/**
 * Validated environment variables
 *
 * Singleton instance - validation only runs once on first import.
 * Subsequent imports return the cached result.
 *
 * @example
 * ```ts
 * import { env } from '@/lib/env';
 *
 * console.log(env.MONGODB_URI);
 * console.log(env.FREE_TRIAL_DAYS); // Type-safe number
 * ```
 */
export const env = parseEnv();

/**
 * Check if running in development mode
 */
export const isDevelopment = env.NODE_ENV === 'development';

/**
 * Check if running in production mode
 */
export const isProduction = env.NODE_ENV === 'production';

/**
 * Check if running in test mode
 */
export const isTest = env.NODE_ENV === 'test';

/**
 * Check if development auth bypass is enabled
 *
 * @returns true only in development with DEV_MODE_BYPASS_AUTH=true
 */
export function isAuthBypassEnabled(): boolean {
  return isDevelopment && env.DEV_MODE_BYPASS_AUTH;
}

/**
 * Get the appropriate protocol based on HTTPS_ONLY setting
 *
 * @returns 'https' if HTTPS_ONLY is true, otherwise 'http'
 */
export function getProtocol(): 'http' | 'https' {
  return env.HTTPS_ONLY ? 'https' : 'http';
}
