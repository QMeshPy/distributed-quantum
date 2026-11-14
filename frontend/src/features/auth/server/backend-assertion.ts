import "server-only";
import { createHmac } from "node:crypto";

const MIN_SECRET_LENGTH = 32;

/**
 * A short-lived, HMAC-signed `Authorization` value naming the signed-in user,
 * verified by the backend's auth dependency. Null when the secret is not set.
 */
export function backendAssertion(
  user: { id: string; email: string },
  wallet?: string | null,
): string | null {
  const secret = process.env.AGENT_AUTH_BRIDGE_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null;
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      iat: now,
      exp: now + 60,
      aud: "quantumnodes-agentkit",
      ...(wallet ? { wallet } : {}),
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  return `Bearer qn1.${body}.${signature}`;
}
