import assert from "node:assert/strict";
import { createServer } from "node:http";

import { mock, test } from "bun:test";

// The runtime module is server-only; the guard throws outside a Next.js server build.
mock.module("server-only", () => ({}));
const { postConfiguredX402Run } = await import("../src/features/x402/server/runtime.ts");

const NETWORK = "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=";

function listen(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

test("unpaid calls to the new services get a 402 and create no job", async () => {
  const backendHits = [];
  const backend = await listen((request, response) => {
    backendHits.push(request.url);
    response.end("{}");
  });
  const facilitator = await listen((request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK }],
        extensions: [],
        signers: {},
      }),
    );
  });
  const environment = {
    X402_ENABLED: "true",
    X402_AVM_ADDRESS: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ",
    X402_GATEWAY_SECRET: "test-shared-secret",
    X402_FACILITATOR_URL: `http://127.0.0.1:${facilitator.address().port}`,
    NEXT_PUBLIC_BACKEND_URL: `http://127.0.0.1:${backend.address().port}`,
  };

  try {
    // USDC has six decimals, so these are the default $0.05, $0.05 and $0.25.
    const amounts = { risk: "50000", finance: "50000", pharma: "250000" };
    for (const service of ["risk", "finance", "pharma"]) {
      const response = await postConfiguredX402Run(
        new Request(`http://localhost:3000/api/x402/${service}/runs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
        environment,
      );
      assert.equal(response.status, 402);
      const requirement = JSON.parse(
        Buffer.from(response.headers.get("payment-required"), "base64").toString(),
      );
      assert.equal(requirement.accepts[0].amount, amounts[service]);
      assert.equal(requirement.resource.url, `http://localhost:3000/api/x402/${service}/runs`);
      assert.ok(requirement.extensions.bazaar.info.input.body, "discovery example input");
    }
    assert.deepEqual(backendHits, []);
  } finally {
    backend.close();
    facilitator.close();
  }
});
