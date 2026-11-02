import "server-only";

import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import { VerifyError, type PaymentPayload, type PaymentRequirements } from "@x402/core/types";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { X402 } from "../../../constants/x402";
import { supportedServers } from "./facilitators";
import {
  loadCircuitPaymentConfig,
  type CircuitPaymentConfig,
} from "./networks";
import { paymentId, paymentProofHash } from "./payment-id";
import { paymentStore, type PaymentStore } from "./payment-store";
import { bodyHash, readQuote, signQuote } from "./quotes";

type Environment = Readonly<Record<string, string | undefined>>;

export async function postCircuitPayment(
  request: Request,
  environment: Environment,
  store: PaymentStore = paymentStore,
): Promise<Response> {
  const config = loadCircuitPaymentConfig(environment);
  let body: string;
  let payment: PaymentPayload | undefined;
  let token = "";
  let amount = "";
  let signedQuote: ReturnType<typeof readQuote> | undefined;
  let id: string | undefined;
  let proofHash: string | undefined;
  try {
    body = await readCircuitBody(request);
    const header = request.headers.get("payment-signature");
    if (header) {
      if (header.length > X402.maxPaymentHeaderBytes)
        throw new Error("Payment header is too large.");
      payment = decodePaymentSignatureHeader(header);
      if (payment.x402Version !== 2 || payment.accepted.scheme !== "exact")
        throw new Error("An exact x402 v2 payment is required.");
      token = payment.accepted.extra?.quote as string;
      signedQuote = readQuote(
        token,
        body,
        config.gatewaySecret,
        Date.now(),
        true,
      );
      if (signedQuote.network !== payment.accepted.network)
        throw new Error("The quote belongs to a different network.");
      amount = signedQuote.amount;
      id = paymentId(payment);
      proofHash = paymentProofHash(payment.payload);
    }
  } catch {
    return Response.json(
      {
        error:
          "Provide a valid circuit request and its matching payment quote.",
      },
      { status: 400 },
    );
  }
  if (payment && id && proofHash) {
    const replay = await store.replay(id, bodyHash(body), proofHash);
    if (replay) return replay;
    try {
      readQuote(token, body, config.gatewaySecret);
    } catch {
      return Response.json(
        { error: "The payment quote expired. Request a new quote." },
        { status: 400 },
      );
    }
  } else {
    const estimate = await internalRequest(config, X402.estimatePath, body);
    if (!estimate.ok) return estimate;
    const quote = await estimate.json();
    amount = quote.amount;
  }

  const servers = await supportedServers(config.networks);
  const available = await Promise.allSettled(
    servers.map(async ({ server, network }) => ({
      server,
      requirements: (
        await server.buildPaymentRequirements({
          scheme: "exact",
          network: network.network,
          payTo: network.payTo,
          price: `$${amount}`,
          maxTimeoutSeconds: X402.quoteLifetimeSeconds,
          extra: payment ? { quote: token } : {},
        })
      )[0],
      asset: network.asset,
    })),
  );
  const offers = available.flatMap((result) =>
    result.status === "fulfilled" &&
    result.value.requirements?.asset.toLowerCase() ===
      result.value.asset.toLowerCase()
      ? [result.value]
      : [],
  );
  const quotedAt = signedQuote
    ? (signedQuote.expires - X402.quoteLifetimeSeconds) * 1000
    : Date.now();
  for (const offer of offers) {
    const requirements = offer.requirements;
    if (!payment || signedQuote?.network !== requirements.network) {
      requirements.extra = {
        ...requirements.extra,
        quote: signQuote(body, amount, config.gatewaySecret, quotedAt, {
          network: requirements.network,
          feePayer: requirements.extra?.feePayer as string | undefined,
        }),
      };
    } else {
      // Keep the signed sponsor when the facilitator rotates its advertised fee payer.
      requirements.extra = { ...requirements.extra, feePayer: signedQuote.feePayer };
    }
  }
  if (!offers.length)
    return Response.json(
      { error: "No payment network is currently available." },
      { status: 503 },
    );
  const challenge = {
    x402Version: 2,
    resource: {
      url: request.url,
      description: "Run an OpenQASM circuit at a quoted USDC price",
      mimeType: "application/json",
    },
    accepts: offers.map((offer) => offer.requirements),
    extensions: declareDiscoveryExtension({
      bodyType: "json",
      input: {
        circuit: 'OPENQASM 2.0; include "qelib1.inc"; qreg q[1]; h q[0];',
      },
      inputSchema: {
        type: "object",
        required: ["circuit"],
        additionalProperties: false,
        properties: { circuit: { type: "string" } },
      },
      output: { example: { job_id: "job-x402-payment-id", status: "queued" } },
    }),
  };
  const unpaid = () =>
    Response.json(challenge, {
      status: 402,
      headers: {
        "PAYMENT-REQUIRED": encodePaymentRequiredHeader(challenge),
        "Cache-Control": "private, no-store",
      },
    });
  if (!payment) return unpaid();
  const offer = offers.find(
    ({ server, requirements }) =>
      server.findMatchingRequirements([requirements], payment) !== undefined,
  );
  if (
    !offer ||
    offer.server.getPaymentFlow(payment, offer.requirements) !== "authorization"
  )
    return unpaid();

  if (!id || !proofHash) return unpaid();
  const hash = bodyHash(body);
  let verification;
  try {
    verification = await offer.server.verifyPayment(payment, offer.requirements);
  } catch (error) {
    if (error instanceof VerifyError && [400, 402, 422].includes(error.statusCode))
      return unpaid();
    throw error;
  }
  if (!verification.isValid || !verification.payer) return unpaid();
  if (!(await store.claim(id, hash, proofHash)))
    return (await store.replay(id, hash, proofHash))!;

  const event = paymentEvent(
    id,
    amount,
    verification.payer,
    offer.requirements,
  );
  let settlementStarted = false;
  try {
    await recordPayment(config, { ...event, status: "pending" });
    const response = await internalRequest(config, X402.submitPath, body, {
      "X-X402-Payment-Id": id,
    });
    if (!response.ok) {
      await recordPayment(config, { ...event, status: "failed" });
      await store.finish(id, response);
      return response;
    }
    const job = await response.clone().json();
    if (job.job_id !== event.job_id)
      throw new Error("Backend returned an unexpected job.");
    settlementStarted = true;
    const receipt = await offer.server.settlePayment(
      payment,
      offer.requirements,
    );
    await store.saveReceipt(id, receipt);
    if (receipt.success && (
      receipt.network !== offer.requirements.network || !receipt.transaction.trim()
    )) {
      throw new Error("The settlement receipt does not match this payment.");
    }
    if (!receipt.success) {
      await recordPayment(config, { ...event, status: "uncertain" });
      const failure = Response.json(
        {
          error:
            "Payment settlement did not complete. Contact support before retrying.",
          job_id: event.job_id,
        },
        { status: 502 },
      );
      await store.finish(id, failure, true);
      return failure;
    }
    await recordPayment(config, {
      ...event,
      status: "confirmed",
      transaction: receipt.transaction,
    });
    const paidResponse = Response.json(
      { job_id: job.job_id, status: "QUEUED" },
      { status: response.status, headers: response.headers },
    );
    paidResponse.headers.set(
      "PAYMENT-RESPONSE",
      encodePaymentResponseHeader(receipt),
    );
    paidResponse.headers.set("Cache-Control", "private, no-store");
    await store.finish(id, paidResponse);
    return paidResponse;
  } catch {
    const failure = Response.json(
      {
        error: settlementStarted
          ? "Payment outcome requires reconciliation. Do not pay again."
          : "Submission outcome requires reconciliation. Do not pay again.",
        job_id: event.job_id,
      },
      { status: 503 },
    );
    try {
      await recordPayment(config, {
        ...event,
        status: settlementStarted ? "uncertain" : "failed",
      });
    } catch {
      console.error(
        "Unable to update the x402 payment event; reconciliation is required.",
      );
    }
    try {
      await store.finish(id, failure, true);
    } catch {
      console.error("Unable to save the x402 response; reconciliation is required.");
    }
    return failure;
  }
}

function paymentEvent(
  id: string,
  amount: string,
  payer: string,
  requirements: PaymentRequirements,
) {
  return {
    payment_id: id,
    network: requirements.network,
    amount,
    asset: requirements.asset,
    payer,
    receiver: requirements.payTo,
    job_id: `job-x402-${id}`,
  };
}

async function recordPayment(
  config: CircuitPaymentConfig,
  event: object,
): Promise<void> {
  const response = await internalRequest(
    config,
    X402.paymentPath,
    JSON.stringify(event),
  );
  if (!response.ok) throw new Error("Unable to record payment.");
}

async function internalRequest(
  config: CircuitPaymentConfig,
  path: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const response = await fetch(`${config.backendBaseUrl}${path}`, {
    method: "POST",
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(X402.timeoutMs),
    headers: {
      "Content-Type": "application/json",
      [X402.gatewayHeader]: config.gatewaySecret,
      ...headers,
    },
  });
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}

async function readCircuitBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("A circuit is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > X402.maxBodyBytes)
        throw new Error("The circuit request is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const data = JSON.parse(Buffer.concat(chunks).toString());
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    Object.keys(data).length !== 1 ||
    typeof data.circuit !== "string"
  )
    throw new Error("Provide only a circuit string.");
  return JSON.stringify({ circuit: data.circuit });
}
