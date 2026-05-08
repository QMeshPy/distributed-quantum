import "server-only";

import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { emailOTP } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import getClient, { getDatabase } from "@/shared/lib/mongodb";
import { AUTH } from "@/constants";

async function sendOTPEmail(email: string, otp: string) {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.OTP_EMAIL_FROM || "noreply@distributed-quantum.com",
    to: email,
    subject: `Your verification code: ${otp}`,
    html: `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #ffffff; color: #181d26;">
        <h1 style="font-size: 24px; font-weight: 500; margin-bottom: 8px;">Verification code</h1>
        <p style="font-size: 14px; color: #41454d; margin-bottom: 32px;">Enter this code to continue:</p>
        <div style="background: #f8fafc; padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 32px; border: 1px solid #dddddd;">
          <span style="font-size: 36px; font-weight: 500; letter-spacing: 8px; color: #181d26;">${otp}</span>
        </div>
        <p style="font-size: 13px; color: #9297a0;">This code expires in ${AUTH.OTP_EXPIRY_SECONDS / 60} minutes.</p>
      </div>
    `,
  });
}

function createAuthInstance(
  db: Awaited<ReturnType<typeof getDatabase>>,
  client: Awaited<ReturnType<typeof getClient>>,
) {
  return betterAuth({
    database: mongodbAdapter(db, { client }),
    emailAndPassword: { enabled: false },
    plugins: [
      emailOTP({
        otpLength: AUTH.OTP_LENGTH,
        expiresIn: AUTH.OTP_EXPIRY_SECONDS,
        allowedAttempts: AUTH.OTP_MAX_ATTEMPTS,
        async sendVerificationOTP({ email, otp, type }) {
          if (type === "sign-in" || type === "email-verification") {
            await sendOTPEmail(email, otp);
          }
        },
      }),
      nextCookies(),
    ],
    session: {
      expiresIn: AUTH.TOKEN_TTL_DAYS * 24 * 60 * 60,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    user: {
      additionalFields: {
        firstName: { type: "string", required: false },
        lastName: { type: "string", required: false },
        organization: { type: "string", required: false },
        designation: { type: "string", required: false },
        trialEndsAt: { type: "string", required: false },
        hasSubscription: { type: "boolean", required: false, defaultValue: false },
      },
    },
  });
}

type AuthInstance = ReturnType<typeof createAuthInstance>;
let _auth: AuthInstance | undefined;

export async function getAuth(): Promise<AuthInstance> {
  if (_auth) return _auth;
  const [db, client] = await Promise.all([getDatabase(), getClient()]);
  _auth = createAuthInstance(db, client);
  return _auth;
}
