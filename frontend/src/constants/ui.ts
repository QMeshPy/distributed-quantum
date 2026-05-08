export const UI = {
  APP_NAME: "Quantum Platform",
  AUTH: {
    SIGNIN_TITLE: "Sign in to your account",
    SIGNIN_SUBTITLE: "Enter your email to receive a one-time code",
    SIGNUP_TITLE: "Create your account",
    SIGNUP_SUBTITLE: "Get started with a free 1-day trial",
    SIGNUP_DETAILS_TITLE: "Tell us about yourself",
    SIGNUP_DETAILS_SUBTITLE: "We'll send an OTP to verify your email",
    OTP_TITLE: "Enter verification code",
    otpSubtitle: (email: string) =>
      `Enter the 6-digit code sent to ${email}` as const,
    OTP_RESEND: "Didn't receive code? Resend",
    SIGNIN_LINK_TEXT: "Already have an account?",
    SIGNUP_LINK_TEXT: "Don't have an account?",
  },
  ERRORS: {
    GENERIC: "Something went wrong. Please try again.",
    OTP_SEND_FAILED: "Failed to send verification code",
    OTP_INVALID: "Invalid or expired code",
    SIGNIN_FAILED: "Failed to sign in",
    SIGNUP_FAILED: "Failed to create account",
    SESSION_EXPIRED: "Your session has expired. Please sign in again.",
    NO_ACCOUNT: "No account found with this email. Please sign up first.",
    EMAIL_EXISTS: "An account with this email already exists. Please sign in instead.",
  },
  SUCCESS: {
    OTP_SENT: "Verification code sent to your email",
    OTP_RESENT: "Code resent to your email",
    SIGNIN: "Signed in successfully!",
    SIGNUP: "Account created successfully!",
    SIGNOUT: "Signed out successfully",
  },
  TRIAL: {
    BADGE_LABEL: "TRIAL",
    expiring: (days: number) =>
      `${days} day${days !== 1 ? "s" : ""} left in your trial. Subscribe to keep access.` as const,
    expired:
      "Your trial has expired. Subscribe to continue using the platform.",
    remaining: (days: number) =>
      `${days} day${days !== 1 ? "s" : ""} remaining` as const,
    SUBSCRIBE_CTA: "Subscribe Now",
    VIEW_PLANS_CTA: "View Plans",
  },
  NAV: {
    DASHBOARD: "Dashboard",
    ANALYTICS: "Analytics",
    NETWORK: "Network",
    FINANCE: "Finance",
    OPTIONS: "Options",
    RISK: "Risk",
    RUNS: "Runs",
    DOCS: "Docs",
    SETTINGS: "Settings",
  },
} as const;
