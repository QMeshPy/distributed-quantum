import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { X402 } from "../../../constants/x402";

type Quote = {
  bodyHash: string;
  amount: string;
  expires: number;
  network?: string;
  feePayer?: string;
};

export function bodyHash(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export function signQuote(
  body: string,
  amount: string,
  secret: string,
  now = Date.now(),
  paymentNetwork: Pick<Quote, "network" | "feePayer"> = {},
): string {
  if (
    !/^\d+\.\d{6}$/.test(amount) ||
    BigInt(amount.replace(".", "")) <= BigInt(0)
  ) {
    throw new Error("Invalid quote amount.");
  }
  const quote: Quote = {
    ...paymentNetwork,
    bodyHash: bodyHash(body),
    amount,
    expires: Math.floor(now / 1000) + X402.quoteLifetimeSeconds,
  };
  const value = Buffer.from(JSON.stringify(quote)).toString("base64url");
  return `${value}.${signature(value, secret)}`;
}

export function readQuote(
  token: unknown,
  body: string,
  secret: string,
  now = Date.now(),
  allowExpired = false,
): Quote {
  if (typeof token !== "string" || token.length > 1024)
    throw new Error("Invalid payment quote.");
  const [value, supplied, extra] = token.split(".");
  if (!value || !supplied || extra || !/^[a-f0-9]{64}$/.test(supplied))
    throw new Error("Invalid payment quote.");
  if (
    !timingSafeEqual(
      Buffer.from(supplied, "hex"),
      Buffer.from(signature(value, secret), "hex"),
    )
  )
    throw new Error("Invalid payment quote.");
  const quote = JSON.parse(Buffer.from(value, "base64url").toString()) as Quote;
  if (quote.bodyHash !== bodyHash(body))
    throw new Error("The payment quote belongs to a different request.");
  if (!allowExpired && quote.expires <= Math.floor(now / 1000))
    throw new Error("The payment quote expired. Request a new quote.");
  return quote;
}

function signature(value: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`x402-circuit-quote:${value}`)
    .digest("hex");
}
