import "server-only";

import {
  ALGORAND_MAINNET_GENESIS_HASH,
  ALGORAND_TESTNET_GENESIS_HASH,
  USDC_MAINNET_ASA_ID,
  USDC_TESTNET_ASA_ID,
  isValidAlgorandAddress,
} from "@x402/avm";

type Environment = Readonly<Record<string, string | undefined>>;

export interface X402Config {
  asset: string;
  backendBaseUrl: string;
  facilitatorUrl: string;
  gatewaySecret: string;
  network:
    | typeof ALGORAND_MAINNET_FACILITATOR_NETWORK
    | typeof ALGORAND_TESTNET_FACILITATOR_NETWORK;
  networkName: "mainnet" | "testnet";
  payTo: string;
  price: string;
}

const ALGORAND_MAINNET_FACILITATOR_NETWORK =
  `algorand:${ALGORAND_MAINNET_GENESIS_HASH}` as const;
const ALGORAND_TESTNET_FACILITATOR_NETWORK =
  `algorand:${ALGORAND_TESTNET_GENESIS_HASH}` as const;

const NETWORKS = {
  mainnet: {
    asset: USDC_MAINNET_ASA_ID,
    network: ALGORAND_MAINNET_FACILITATOR_NETWORK,
  },
  testnet: {
    asset: USDC_TESTNET_ASA_ID,
    network: ALGORAND_TESTNET_FACILITATOR_NETWORK,
  },
} as const;

export function loadX402Config(environment: Environment): X402Config | null {
  if (environment.X402_ENABLED !== "true") {
    return null;
  }

  const networkName = environment.X402_NETWORK ?? "testnet";
  if (networkName !== "testnet" && networkName !== "mainnet") {
    throw new Error("X402_NETWORK must be 'testnet' or 'mainnet'.");
  }

  const payTo = required(environment, "X402_AVM_ADDRESS");
  if (!isValidAlgorandAddress(payTo)) {
    throw new Error("X402_AVM_ADDRESS must be a valid Algorand address.");
  }

  const price = environment.X402_QUANTUM_RUN_PRICE ?? "$0.01";
  if (!/^\$(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(price) || Number(price.slice(1)) <= 0) {
    throw new Error("X402_QUANTUM_RUN_PRICE must be a positive USD amount.");
  }

  const facilitatorUrl = validUrl(
    environment.X402_FACILITATOR_URL ?? "https://facilitator.goplausible.xyz",
    "X402_FACILITATOR_URL",
  );
  const backendBaseUrl = validUrl(
    environment.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8081",
    "NEXT_PUBLIC_BACKEND_URL",
  ).replace(/\/$/, "");
  const gatewaySecret = required(environment, "X402_GATEWAY_SECRET");
  if (gatewaySecret.length < 16) {
    throw new Error("X402_GATEWAY_SECRET must contain at least 16 characters.");
  }

  return {
    ...NETWORKS[networkName],
    backendBaseUrl,
    facilitatorUrl,
    gatewaySecret,
    networkName,
    payTo,
    price,
  };
}

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when x402 is enabled.`);
  }
  return value;
}

function validUrl(value: string, name: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      throw new Error();
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${name} must be an HTTPS URL (HTTP is allowed only for localhost).`);
  }
}
