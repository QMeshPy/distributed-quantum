import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchX402Job,
  submitX402Job,
} from "../src/features/x402/server/backend.ts";
import type { X402Config } from "../src/features/x402/server/config.ts";

const config: X402Config = {
  asset: "10458941",
  backendBaseUrl: "http://backend.test",
  facilitatorUrl: "https://facilitator.goplausible.xyz",
  gatewaySecret: "test-shared-secret",
  network: "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
  networkName: "testnet",
  payTo: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ",
  price: "$0.01",
};

test("paid submissions forward only the internal credential and body", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return Response.json({ job_id: "job-paid", status: "queued" }, { status: 201 });
  };
  const request = new Request("https://example.test/api/x402/quantum/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ circuit: "OPENQASM 2.0; qreg q[1];" }),
  });

  const response = await submitX402Job(request, config, "circuits", fetcher);

  assert.equal(capturedUrl, "http://backend.test/api/v1/internal/x402/circuits/submit");
  assert.equal(new Headers(capturedInit?.headers).get("X-X402-Gateway-Secret"), "test-shared-secret");
  assert.equal(capturedInit?.body, JSON.stringify({ circuit: "OPENQASM 2.0; qreg q[1];" }));
  assert.equal(response.status, 201);
});

test("free polling URL-encodes the capability job id", async () => {
  let capturedUrl = "";
  const fetcher: typeof fetch = async (input) => {
    capturedUrl = String(input);
    return Response.json({ job_id: "job/paid", status: "queued" });
  };

  await fetchX402Job("job/paid", config, "circuits", fetcher);

  assert.equal(capturedUrl, "http://backend.test/api/v1/internal/x402/circuits/jobs/job%2Fpaid");
});

test("options submissions forward to the options-scoped internal route", async () => {
  let capturedUrl = "";
  const fetcher: typeof fetch = async (input) => {
    capturedUrl = String(input);
    return Response.json({ job_id: "opt-1", status: "queued" }, { status: 201 });
  };
  const request = new Request("https://example.test/api/x402/options/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ option_type: "european_call_short" }),
  });

  await submitX402Job(request, config, "options", fetcher);

  assert.equal(capturedUrl, "http://backend.test/api/v1/options/internal/x402/submit");
});
