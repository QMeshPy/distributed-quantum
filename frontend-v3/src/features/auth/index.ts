/**
 * Auth Feature Public API
 *
 * Centralized exports for the authentication feature
 */

// Components
export { LoginForm } from './components/login-form';
export { SignupForm } from './components/signup-form';

// Mutations
export { useSendLoginOtp } from './mutations/use-login';
export { useSignup } from './mutations/use-signup';
export { useVerifyOtp } from './mutations/use-verify-otp';
export { useResendOtp } from './mutations/use-resend-otp';
export { useLogout } from './mutations/use-logout';

// Queries
export { useSession } from './queries/use-session';

// Store
export { useAuthStore } from './store/auth-store';

// Schemas
export {
  emailSchema,
  userDetailsSchema,
  otpSchema,
  type EmailFormData,
  type UserDetailsData,
  type OtpFormData,
} from './schemas/auth-schemas';

// Types
export type {
  ApiErrorResponse,
  VerifyOtpResponse,
  SendOtpResponse,
  SessionResponse,
  ValidationError,
} from './types';
