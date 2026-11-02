import assert from "node:assert/strict";
import test from "node:test";
import { readQuote, signQuote } from "../src/features/x402/server/quotes.ts";
import { loadCircuitPaymentConfig } from "../src/features/x402/server/networks.ts";
import { paymentId } from "../src/features/x402/server/payment-id.ts";
import type { PaymentPayload } from "@x402/core/types";

const secret = "test-gateway-secret";
const body = JSON.stringify({ circuit: "h q[0];" });

test("quotes bind the amount and body and expire", () => {
  const token = signQuote(body, "0.010000", secret, 0);
  assert.equal(readQuote(token, body, secret, 1).amount, "0.010000");
  assert.throws(
    () => readQuote(token, "different", secret, 1),
    /different request/,
  );
  assert.throws(() => readQuote(token, body, "different-secret", 1), /Invalid/);
  assert.throws(() => readQuote(`${token}x`, body, secret, 1), /Invalid/);
  assert.throws(() => readQuote(token, body, secret, 300_000), /expired/);
  assert.equal(
    readQuote(token, body, secret, 300_000, true).amount,
    "0.010000",
  );
});

test("only valid enabled testnets are configured", () => {
  const config = loadCircuitPaymentConfig({
    X402_GATEWAY_SECRET: secret,
    X402_NETWORKS: JSON.stringify([
      { network: "eip155:84532", payTo: `0x${"11".repeat(20)}` },
      { network: "eip155:8453", payTo: `0x${"11".repeat(20)}` },
      { network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", payTo: "invalid" },
      {
        network: "eip155:84532",
        payTo: `0x${"22".repeat(20)}`,
        enabled: false,
      },
    ]),
  });
  assert.equal(config.networks.length, 1);
  assert.equal(config.networks[0].network, "eip155:84532");
});

test("no receivers, unsafe URLs, and wrong assets fail closed", () => {
  for (const entry of [
    {
      network: "eip155:84532",
      payTo: `0x${"11".repeat(20)}`,
      facilitatorUrl: "http://example.com",
    },
    {
      network: "eip155:84532",
      payTo: `0x${"11".repeat(20)}`,
      asset: "other-token",
    },
    { network: "eip155:84532", payTo: `0x${"00".repeat(20)}` },
  ])
    assert.throws(
      () =>
        loadCircuitPaymentConfig({
          X402_GATEWAY_SECRET: secret,
          X402_NETWORKS: JSON.stringify([entry]),
        }),
      /No valid/,
    );
});

test("an evm authorization retains its payment identity across unsigned metadata changes", () => {
  const payment = {
    x402Version: 2,
    accepted: { network: "eip155:84532", asset: "USDC", extra: {} },
    payload: {
      authorization: {
        from: `0x${"11".repeat(20)}`,
        nonce: `0x${"22".repeat(32)}`,
      },
      signature: "signature",
    },
  } as unknown as PaymentPayload;
  const id = paymentId(payment);
  payment.accepted.extra = { quote: "another quote" };
  payment.payload.signature = "another signature";
  assert.equal(paymentId(payment), id);
});
