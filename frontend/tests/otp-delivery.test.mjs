import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { memoryAdapter } from "better-auth/adapters/memory";

const database = { user: [], session: [], account: [], verification: [] };
const send = mock(async () => ({ data: { id: "email-1" }, error: null }));
mock.module("server-only", () => ({}));
mock.module("better-auth/adapters/mongodb", () => ({ mongodbAdapter: () => memoryAdapter(database) }));
mock.module("../src/shared/lib/mongodb", () => ({ default: async () => ({}), getDatabase: async () => ({}) }));
mock.module("../src/features/billing/server/stripe", () => ({ createStripePlugin: () => null }));
mock.module("resend", () => ({ Resend: class { emails = { send }; } }));

const keys = ["RESEND_API_KEY", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"];
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
process.env.BETTER_AUTH_SECRET = "fixture-secret-for-otp-delivery-tests-123456789";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
afterAll(() => {
  for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});
afterEach(() => {
  send.mockReset();
  send.mockResolvedValue({ data: { id: "email-1" }, error: null });
});
const { getAuth } = await import("../src/features/auth/server/auth");
let sequence = 0;

async function requestOTP() {
  const auth = await getAuth();
  return auth.handler(new Request("http://localhost:3000/api/auth/email-otp/send-verification-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({ email: `user-${++sequence}@example.test`, type: "sign-in" }),
  }));
}

test("OTP requests report unavailable delivery when email is not configured", async () => {
  delete process.env.RESEND_API_KEY;
  const context = await (await getAuth()).$context;
  const originalRunner = context.runInBackgroundOrAwait;
  const response = await requestOTP();
  expect(response.status).toBe(503);
  expect((await response.json()).message).toContain("temporarily unavailable");
  expect(send).not.toHaveBeenCalled();
  expect(context.runInBackgroundOrAwait).toBe(originalRunner);
});

test("OTP requests reject provider errors without returning provider details", async () => {
  process.env.RESEND_API_KEY = "fixture-resend-key";
  send.mockResolvedValue({ data: null, error: { message: "private provider detail" } });
  const response = await requestOTP();
  expect(response.status).toBe(502);
  expect((await response.json()).message).toBe("Failed to send verification code. Please try again.");
});

test("OTP requests report success after the provider accepts the email", async () => {
  process.env.RESEND_API_KEY = "fixture-resend-key";
  const response = await requestOTP();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true });
  expect(send).toHaveBeenCalledTimes(1);
});
