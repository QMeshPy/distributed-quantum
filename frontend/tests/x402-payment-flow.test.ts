import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { encodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { postCircuitPayment } from "../src/features/x402/server/circuit-payments.ts";
import { readQuote } from "../src/features/x402/server/quotes.ts";
import type { PaymentStore } from "../src/features/x402/server/payment-store.ts";
import { simulatedTransactionPayments } from "./fixtures/x402-payments.ts";

test("gateway protocol with simulated facilitator and backend", async (t) => {
  let svmFeePayer: string | undefined = "CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5";
  let avmFeePayer = "G7QWRIJODICBDG6JAVXNKHNTCKTBJZBXTSCGQLSMXSCIKEJ5SNFPEJSFQQ";
  let submissions = 0;
  let settlements = 0;
  let submitStatus = 201;
  let settlementSuccess = true;
  let receiptFault: "network" | "transaction" | "disconnect" | undefined;
  let rejectReceipt = false;
  let rejectConfirmation = false;
  let rejectFinish = false;
  let verificationValid = true;
  let verificationStatus = 200;
  const events: string[] = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString())
      : {};
    response.setHeader("Content-Type", "application/json");
    let result: object;
    switch (request.url) {
      case "/supported":
        result = {
          kinds: [
            { x402Version: 2, scheme: "exact", network: "eip155:84532" },
            {
              x402Version: 2,
              scheme: "exact",
              network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
              extra: {
                feePayer: svmFeePayer,
              },
            },
            {
              x402Version: 2,
              scheme: "exact",
              network: "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe",
              extra: {
                feePayer: avmFeePayer,
              },
            },
          ],
          extensions: [],
          signers: {},
        };
        break;
      case "/verify":
        response.statusCode = verificationStatus;
        result = { isValid: verificationValid, payer: `0x${"11".repeat(20)}` };
        break;
      case "/settle":
        settlements++;
        if (receiptFault === "disconnect") {
          response.writeHead(200);
          response.flushHeaders();
          response.write("{");
          setTimeout(() => response.destroy(), 5);
          return;
        }
        result = {
          success: settlementSuccess,
          transaction: receiptFault === "transaction" ? " " : "test-transaction",
          network: receiptFault === "network" ? "eip155:1" : body.paymentRequirements.network,
          payer: `0x${"11".repeat(20)}`,
        };
        break;
      case "/api/v1/internal/x402/circuits/estimate":
        result = { amount: "0.025000" };
        break;
      case "/api/v1/internal/x402/payments":
        events.push(body.status);
        if (rejectConfirmation && body.status === "confirmed") response.statusCode = 503;
        result = { status: body.status };
        break;
      case "/api/v1/internal/x402/circuits/submit":
        submissions++;
        response.statusCode = submitStatus;
        result =
          submitStatus === 201
            ? {
                job_id: `job-x402-${request.headers["x-x402-payment-id"]}`,
                status: "PAYMENT_PENDING",
              }
            : { error: "Rejected" };
        break;
      default:
        response.statusCode = 404;
        result = {};
    }
    response.end(JSON.stringify(result));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const environment = {
    X402_GATEWAY_SECRET: "test-gateway-secret",
    NEXT_PUBLIC_BACKEND_URL: base,
    X402_NETWORKS: JSON.stringify([
      {
        network: "eip155:84532",
        payTo: `0x${"22".repeat(20)}`,
        facilitatorUrl: base,
      },
      {
        network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
        payTo: "CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5",
        facilitatorUrl: base,
      },
      {
        network: "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe",
        payTo: "G7QWRIJODICBDG6JAVXNKHNTCKTBJZBXTSCGQLSMXSCIKEJ5SNFPEJSFQQ",
        facilitatorUrl: base,
      },
    ]),
  };
  const records = new Map<
    string,
    { hash: string; proof: string; response?: Response }
  >();
  const store: PaymentStore = {
    async claim(id, hash, proof) {
      if (records.has(id)) return false;
      records.set(id, { hash, proof });
      return true;
    },
    async replay(id, hash, proof) {
      const record = records.get(id);
      if (!record) return null;
      if (record.hash !== hash || record.proof !== proof)
        return new Response(null, { status: 409 });
      return record.response?.clone() ?? new Response(null, { status: 409 });
    },
    async finish(id, response) {
      if (rejectFinish) throw new Error("Simulated final response storage outage");
      records.get(id)!.response = response.clone();
    },
    async saveReceipt() {
      if (rejectReceipt) throw new Error("Simulated receipt storage outage");
    },
  };
  const circuit = 'OPENQASM 2.0; include "qelib1.inc"; qreg q[1]; h q[0];';
  const call = (payment?: PaymentPayload, input = circuit) =>
    postCircuitPayment(
      new Request("https://example.test/api/x402/quantum/runs", {
        method: "POST",
        body: JSON.stringify({ circuit: input }),
        headers: payment
          ? { "payment-signature": encodePaymentSignatureHeader(payment) }
          : {},
      }),
      environment,
      store,
    );
  const unpaid = await call();
  assert.equal(unpaid.status, 402, await unpaid.clone().text());
  const challenge = await unpaid.json();
  assert.equal(challenge.accepts.length, 3);
  assert.equal(submissions, 0);
  const makePayment = (nonce: string): PaymentPayload => ({
    x402Version: 2,
    accepted: challenge.accepts[0],
    payload: {
      authorization: {
        from: `0x${"11".repeat(20)}`,
        nonce: `0x${nonce.repeat(64)}`,
      },
      signature: "simulated",
    },
  });

  const wrongNetwork = makePayment("d");
  wrongNetwork.accepted = {
    ...challenge.accepts[1],
    extra: { ...challenge.accepts[1].extra, quote: challenge.accepts[0].extra.quote },
  };
  assert.equal((await call(wrongNetwork)).status, 400);
  assert.equal(settlements, 0);

  const now = Date.now;
  const originalQuote = readQuote(challenge.accepts[0].extra.quote,
    JSON.stringify({ circuit }), environment.X402_GATEWAY_SECRET);
  try {
    Date.now = () => now() + 90_000;
    verificationValid = false;
    const rejected = await call(makePayment("e"));
    assert.equal(rejected.status, 402);
    for (const offer of (await rejected.json()).accepts) {
      const quote = readQuote(offer.extra.quote, JSON.stringify({ circuit }),
        environment.X402_GATEWAY_SECRET);
      assert.equal(quote.expires, originalQuote.expires,
        "switching networks must not extend an old price quote");
    }
  } finally {
    Date.now = now;
    verificationValid = true;
  }

  verificationValid = false;
  for (const status of [400, 402, 422]) {
    verificationStatus = status;
    assert.equal((await call(makePayment("e"))).status, 402,
      "invalid payment responses should return a new challenge");
    assert.equal(submissions, 0);
    assert.equal(settlements, 0);
  }
  verificationStatus = 503;
  await assert.rejects(call(makePayment("e")));
  assert.equal(submissions, 0);
  verificationStatus = 200;
  verificationValid = true;

  const payment = makePayment("1");
  const paid = await call(payment);
  assert.equal(paid.status, 201, await paid.clone().text());
  assert.ok(paid.headers.get("PAYMENT-RESPONSE"));
  assert.equal((await paid.clone().json()).status, "QUEUED");
  assert.deepEqual(await (await call(payment)).json(), await paid.json());
  const reordered = {
    ...payment,
    payload: {
      signature: payment.payload.signature,
      authorization: Object.fromEntries(Object.entries(
        payment.payload.authorization as Record<string, unknown>,
      ).reverse()),
    },
  };
  assert.equal((await call(reordered)).status, 201,
    "reordering JSON keys must preserve payment replay");
  assert.equal(submissions, 1);
  assert.equal(settlements, 1);
  assert.deepEqual(events, ["pending", "confirmed"]);
  assert.equal((await call(payment, `${circuit} h q[0];`)).status, 400);

  try {
    Date.now = () => now() + 600_000;
    assert.equal((await call(payment)).status, 201,
      "completed payments must replay after their quote expires");
    assert.equal((await call(makePayment("0"))).status, 400,
      "new payments must not use an expired quote");
    assert.equal(settlements, 1);
  } finally {
    Date.now = now;
  }

  const simultaneous = await Promise.all([
    call(makePayment("2")),
    call(makePayment("2")),
  ]);
  assert.equal(
    simultaneous.filter((result) => result.status === 201).length >= 1,
    true,
  );
  assert.equal(submissions, 2);
  assert.equal(settlements, 2);

  for (const [nonce, status] of [["3", 400], ["5", 422], ["6", 500], ["7", 503]] as const) {
    submitStatus = status;
    assert.equal((await call(makePayment(nonce))).status, status);
    assert.equal(settlements, 2);
  }
  submitStatus = 201;
  settlementSuccess = false;
  assert.equal((await call(makePayment("4"))).status, 502);
  assert.equal((await call(makePayment("4"))).status, 502);
  assert.equal(settlements, 3);
  assert.equal(events.at(-1), "uncertain");

  settlementSuccess = true;
  for (const [family, payload] of Object.entries(simulatedTransactionPayments())) {
    const transactionPayment: PaymentPayload = {
      x402Version: 2,
      accepted: challenge.accepts.find(
        (offer: PaymentRequirements) => offer.network.startsWith(`${family}:`),
      ),
      payload,
    };
    const beforeSubmissions: number = submissions;
    const beforeSettlements: number = settlements;
    const response = await call(transactionPayment);
    assert.equal(response.status, 201, await response.clone().text());
    assert.deepEqual(await (await call(transactionPayment)).json(), await response.json());
    assert.equal(submissions, beforeSubmissions + 1);
    assert.equal(settlements, beforeSettlements + 1);
  }

  for (const failure of ["receipt", "confirmation"] as const) {
    rejectReceipt = failure === "receipt";
    rejectConfirmation = failure === "confirmation";
    const interruptedPayment = makePayment(failure === "receipt" ? "8" : "9");
    const beforeSettlements: number = settlements;
    assert.equal((await call(interruptedPayment)).status, 503);
    assert.equal((await call(interruptedPayment)).status, 503);
    assert.equal(settlements, beforeSettlements + 1);
    assert.equal(events.at(-1), "uncertain");
  }
  rejectReceipt = false;
  rejectConfirmation = false;
  for (const [nonce, fault] of [["a", "network"], ["b", "transaction"], ["c", "disconnect"]] as const) {
    // Bun retries disconnected fetches internally; exercise this case in the Node build.
    if (fault === "disconnect" && process.versions.bun) continue;
    receiptFault = fault;
    const beforeSettlements: number = settlements;
    const faultyPayment = makePayment(nonce);
    assert.equal((await call(faultyPayment)).status, 503, `reject ${fault} settlement`);
    assert.equal((await call(faultyPayment)).status, 503);
    assert.equal(settlements, beforeSettlements + 1);
    assert.equal(events.at(-1), "uncertain");
  }
  receiptFault = undefined;
  rejectFinish = true;
  const interrupted = makePayment("f");
  const beforeFinishFailure = settlements;
  const responseWithoutStorage = await call(interrupted);
  assert.equal(responseWithoutStorage.status, 503);
  assert.match((await responseWithoutStorage.json()).job_id, /^job-x402-/);
  rejectFinish = false;
  assert.equal((await call(interrupted)).status, 409);
  assert.equal(settlements, beforeFinishFailure + 1);
  records.clear();
  svmFeePayer = "EGEoUwwdY1BKxYpLhHrEED9NJQzJWZiDT5XZSXfiSfRb";
  avmFeePayer = "74MQ33W5UIV3YHUFZ242ZCHIAZNUGALOOPVFN32QJUNIXPDAVQGVSH6HDQ";
  for (const [family, payload] of Object.entries(simulatedTransactionPayments())) {
    const response = await call({
      x402Version: 2,
      accepted: challenge.accepts.find(
        (offer: PaymentRequirements) => offer.network.startsWith(`${family}:`),
      ),
      payload,
    });
    assert.equal(response.status, 201, `${family} fee-payer rotation must preserve the quote`);
  }
  svmFeePayer = undefined;
  const missingFeePayer = await (await call()).json();
  assert.equal(missingFeePayer.accepts.some(
    (offer: PaymentRequirements) => offer.network.startsWith("solana:"),
  ), false, "unusable Solana offers must be omitted");

});
