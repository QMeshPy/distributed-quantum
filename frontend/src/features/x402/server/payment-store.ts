import "server-only";

import { MongoServerError } from "mongodb";
import type { SettleResponse } from "@x402/core/types";
import { getDatabase } from "../../../shared/lib/mongodb";

export type SavedResponse = {
  status: number;
  body: string;
  headers: Record<string, string>;
};
export interface PaymentStore {
  claim: typeof claimPayment;
  replay: typeof replayPayment;
  finish: typeof finishPayment;
  saveReceipt: typeof saveReceipt;
}
export const paymentStore: PaymentStore = {
  claim: claimPayment,
  replay: replayPayment,
  finish: finishPayment,
  saveReceipt,
};
type PaymentRecord = {
  _id: string;
  bodyHash: string;
  proofHash: string;
  state: "pending" | "complete" | "uncertain";
  response?: SavedResponse;
  receipt?: SettleResponse;
  createdAt: Date;
  updatedAt: Date;
};

export async function claimPayment(
  id: string,
  hash: string,
  proofHash: string,
): Promise<boolean> {
  const collection = (await getDatabase()).collection<PaymentRecord>(
    "x402_gateway_payments",
  );
  try {
    const now = new Date();
    await collection.insertOne(
      {
        _id: id,
        bodyHash: hash,
        proofHash,
        state: "pending",
        createdAt: now,
        updatedAt: now,
      },
      { writeConcern: { w: "majority" } },
    );
    return true;
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) return false;
    throw error;
  }
}

export async function replayPayment(
  id: string,
  hash: string,
  proofHash: string,
): Promise<Response | null> {
  const record = await (await getDatabase())
    .collection<PaymentRecord>("x402_gateway_payments")
    .findOne({ _id: id });
  if (!record) return null;
  if (record.bodyHash !== hash || record.proofHash !== proofHash)
    return Response.json(
      { error: "This payment was already used for another request." },
      { status: 409 },
    );
  if (!record.response)
    return Response.json(
      {
        error:
          "This payment is pending or requires reconciliation. Do not submit another payment.",
      },
      { status: 409 },
    );
  return new Response(record.response.body, {
    status: record.response.status,
    headers: record.response.headers,
  });
}

export async function saveReceipt(
  id: string,
  receipt: SettleResponse,
): Promise<void> {
  const result = await (await getDatabase())
    .collection<PaymentRecord>("x402_gateway_payments")
    .updateOne(
      { _id: id, state: "pending" },
      { $set: { receipt, updatedAt: new Date() } },
      { writeConcern: { w: "majority" } },
    );
  if (result.matchedCount !== 1)
    throw new Error("Unable to persist the settlement receipt.");
}

export async function finishPayment(
  id: string,
  response: Response,
  uncertain = false,
): Promise<void> {
  const headers = Object.fromEntries(response.headers.entries());
  const result = await (await getDatabase())
    .collection<PaymentRecord>("x402_gateway_payments")
    .updateOne(
      { _id: id, state: "pending" },
      {
        $set: {
          state: uncertain ? "uncertain" : "complete",
          updatedAt: new Date(),
          response: {
            status: response.status,
            body: await response.clone().text(),
            headers,
          },
        },
      },
      { writeConcern: { w: "majority" } },
    );
  if (result.matchedCount !== 1)
    throw new Error("Unable to persist the payment outcome.");
}
