import assert from "node:assert/strict";
import test from "node:test";

import { loadX402Config } from "../src/features/x402/server/config.ts";

const baseEnvironment = {
  X402_ENABLED: "true",
  X402_AVM_ADDRESS:
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ",
  X402_GATEWAY_SECRET: "test-shared-secret",
};

test("x402 is opt-in and defaults to Algorand TestNet USDC", () => {
  assert.equal(loadX402Config({}), null);

  const config = loadX402Config(baseEnvironment);

  assert.equal(config?.networkName, "testnet");
  assert.equal(
    config?.network,
    "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
  );
  assert.equal(config?.asset, "10458941");
  assert.equal(config?.price, "$0.01");
  assert.equal(config?.facilitatorUrl, "https://facilitator.goplausible.xyz");
});

test("x402 validates payment-boundary configuration", () => {
  assert.throws(
    () => loadX402Config({ ...baseEnvironment, X402_NETWORK: "base-sepolia" }),
    /X402_NETWORK/,
  );
  assert.throws(
    () => loadX402Config({ ...baseEnvironment, X402_AVM_ADDRESS: "not-an-address" }),
    /X402_AVM_ADDRESS/,
  );
  assert.throws(
    () => loadX402Config({ ...baseEnvironment, X402_QUANTUM_RUN_PRICE: "$0" }),
    /X402_QUANTUM_RUN_PRICE/,
  );
});
