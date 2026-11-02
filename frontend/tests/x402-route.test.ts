import assert from "node:assert/strict";
import test from "node:test";

import { postQuantumRun } from "../src/features/x402/server/quantum-runs.ts";
import { getServiceRun, postServiceRun } from "../src/features/x402/server/service-runs.ts";

test("the paid route fails closed until x402 is configured", async () => {
  const request = new Request("https://example.test/api/x402/quantum/runs", {
    method: "POST",
    body: JSON.stringify({ circuit: "OPENQASM 2.0; qreg q[1];" }),
  });

  const response = await postQuantumRun(request, {});

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Algorand x402 is not enabled." });
});

for (const service of ["risk", "finance", "pharma"] as const) {
  test(`the ${service} routes fail closed until x402 is configured`, async () => {
    const request = new Request(`https://example.test/api/x402/${service}/runs`, {
      method: "POST",
      body: "{}",
    });

    const submitted = await postServiceRun(request, {});
    const polled = await getServiceRun(service, "job-1", {});

    for (const response of [submitted, polled]) {
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "Algorand x402 is not enabled." });
    }
  });
}
