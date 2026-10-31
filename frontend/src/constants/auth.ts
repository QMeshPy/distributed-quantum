export const AUTH = {
  COOKIE_NAME: "better-auth.session_token",
  TOKEN_TTL_DAYS: 7,
  OTP_EXPIRY_SECONDS: 300,
  OTP_LENGTH: 6,
  OTP_MAX_ATTEMPTS: 3,
  OTP_SEND_PATH: "/email-otp/send-verification-otp",
  OTP_NOT_CONFIGURED_MESSAGE: "Email delivery is temporarily unavailable. Please try again later.",
  OTP_SEND_FAILED_MESSAGE: "Failed to send verification code. Please try again.",
  UNAVAILABLE_MESSAGE: "Sign-in is temporarily unavailable. Please try again shortly.",
  SIGNIN_REQUIRED_MESSAGE: "Sign in to continue.",
  TRIAL_DURATION_DAYS: 1,
} as const;
