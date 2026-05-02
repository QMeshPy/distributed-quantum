import { z } from 'zod';

/**
 * Standard API error codes
 */
export enum ApiErrorCode {
  // Authentication errors (401)
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',

  // Authorization errors (403)
  FORBIDDEN = 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  TIER_LIMIT_EXCEEDED = 'TIER_LIMIT_EXCEEDED',

  // Validation errors (400)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // Resource errors (404)
  NOT_FOUND = 'NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  CLUSTER_NOT_FOUND = 'CLUSTER_NOT_FOUND',

  // Conflict errors (409)
  CONFLICT = 'CONFLICT',
  EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS',
  CLUSTER_ID_EXISTS = 'CLUSTER_ID_EXISTS',

  // Server errors (500)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',

  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

/**
 * API error response structure
 */
export interface ApiError {
  /** Error code for programmatic handling */
  code: ApiErrorCode | string;
  /** Human-readable error message */
  message: string;
  /** Optional additional error details */
  details?: Record<string, unknown>;
  /** Optional field-specific validation errors */
  fieldErrors?: Record<string, string[]>;
}

/**
 * Successful API response wrapper
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

/**
 * Failed API response wrapper
 */
export interface ApiErrorResponse {
  success: false;
  error: ApiError;
}

/**
 * Generic API response type
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Zod schema for API error
 */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  fieldErrors: z.record(z.array(z.string())).optional(),
});

/**
 * Zod schema for success response
 */
export const apiSuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

/**
 * Zod schema for error response
 */
export const apiErrorResponseSchema = z.object({
  success: false,
  error: apiErrorSchema,
});

/**
 * Create a typed API response schema
 */
export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.union([apiSuccessResponseSchema(dataSchema), apiErrorResponseSchema]);

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  /** Current page number (1-indexed) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Total number of items */
  totalItems: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether there is a next page */
  hasNextPage: boolean;
  /** Whether there is a previous page */
  hasPreviousPage: boolean;
}

/**
 * Paginated API response
 */
export interface PaginatedApiResponse<T = unknown> {
  success: true;
  data: T[];
  meta: PaginationMeta;
}

/**
 * Auth endpoints
 */

/**
 * Login request body
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Login response data
 */
export interface LoginResponse {
  user: {
    _id: string;
    email: string;
    name: string;
    tier: string;
  };
  token: string;
  expiresAt: string;
}

/**
 * Signup request body
 */
export interface SignupRequest {
  email: string;
  password: string;
  name: string;
}

/**
 * Signup response data (same as login)
 */
export type SignupResponse = LoginResponse;

/**
 * Logout response
 */
export interface LogoutResponse {
  message: string;
}

/**
 * Refresh token request
 */
export interface RefreshTokenRequest {
  token: string;
}

/**
 * Refresh token response
 */
export interface RefreshTokenResponse {
  token: string;
  expiresAt: string;
}

/**
 * Zod schemas for auth endpoints
 */

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const signupRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
});

export const refreshTokenRequestSchema = z.object({
  token: z.string().min(1),
});

/**
 * Helper function to create success response
 */
export function createSuccessResponse<T>(data: T): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Helper function to create error response
 */
export function createErrorResponse(
  code: ApiErrorCode | string,
  message: string,
  details?: Record<string, unknown>,
  fieldErrors?: Record<string, string[]>
): ApiErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
      fieldErrors,
    },
  };
}

/**
 * Type guard to check if response is successful
 */
export function isSuccessResponse<T>(
  response: ApiResponse<T>
): response is ApiSuccessResponse<T> {
  return response.success === true;
}

/**
 * Type guard to check if response is an error
 */
export function isErrorResponse(response: ApiResponse): response is ApiErrorResponse {
  return response.success === false;
}
