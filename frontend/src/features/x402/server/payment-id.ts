import "server-only";

import { createHash } from "node:crypto";
import {
  decodeTransaction,
  getTransactionId,
  isExactAvmPayload,
} from "@x402/avm";
import {
  decodeTransactionFromPayload,
  transactionMessageHash,
} from "@x402/svm";
import type { PaymentPayload } from "@x402/core/types";

export function paymentProofHash(payload: PaymentPayload["payload"]): string {
  const canonical = JSON.stringify(payload, (_, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]))
      : value,
  );
  return createHash("sha256").update(canonical).digest("hex");
}

export function paymentId(payment: PaymentPayload): string {
  const { network, asset } = payment.accepted;
  const payload = payment.payload;
  let identity: string;
  if (network.startsWith("eip155:")) {
    const authorization = payload.authorization as
      | Record<string, unknown>
      | undefined;
    if (
      !authorization ||
      typeof authorization.from !== "string" ||
      typeof authorization.nonce !== "string" ||
      !/^0x[0-9a-f]{64}$/i.test(authorization.nonce)
    ) {
      throw new Error("Expected an EIP-3009 payment authorization.");
    }
    identity = `${authorization.from.toLowerCase()}:${authorization.nonce.toLowerCase()}`;
  } else if (network.startsWith("solana:")) {
    if (typeof payload.transaction !== "string")
      throw new Error("Invalid Solana payment.");
    identity = transactionMessageHash(
      decodeTransactionFromPayload({ transaction: payload.transaction }),
    );
  } else {
    if (!isExactAvmPayload(payload))
      throw new Error("Invalid Algorand payment.");
    const transaction = payload.paymentGroup[payload.paymentIndex];
    if (!transaction) throw new Error("Missing Algorand payment transaction.");
    identity = getTransactionId(decodeTransaction(transaction));
  }
  const normalizedNetwork = network.startsWith("algorand:")
    ? "algorand:testnet"
    : network;
  return createHash("sha256")
    .update(`${normalizedNetwork}:${asset.toLowerCase()}:${identity}`)
    .digest("hex");
}
