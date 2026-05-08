export const AUTH = {
  COOKIE_NAME: "better-auth.session_token",
  TOKEN_TTL_DAYS: 7,
  OTP_EXPIRY_SECONDS: 300,
  OTP_LENGTH: 6,
  OTP_MAX_ATTEMPTS: 3,
  TRIAL_DURATION_DAYS: 1,
} as const;
