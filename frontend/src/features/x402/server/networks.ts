import "server-only";

import { isValidAlgorandAddress } from "@x402/avm";
import { validateSvmAddress } from "@x402/svm";
import { X402 } from "../../../constants/x402";

type Environment = Readonly<Record<string, string | undefined>>;
export type PaymentNetwork = {
  network: keyof typeof X402.networks;
  asset: string;
  payTo: string;
  facilitatorUrl: string;
};
export type CircuitPaymentConfig = {
  backendBaseUrl: string;
  gatewaySecret: string;
  networks: PaymentNetwork[];
};

export function loadCircuitPaymentConfig(
  environment: Environment,
): CircuitPaymentConfig {
  const gatewaySecret = environment.X402_GATEWAY_SECRET?.trim() ?? "";
  if (gatewaySecret.length < 16)
    throw new Error("X402_GATEWAY_SECRET must contain at least 16 characters.");
  const backendBaseUrl = httpUrl(
    environment.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8081",
  );
  const entries: unknown = environment.X402_NETWORKS
    ? JSON.parse(environment.X402_NETWORKS)
    : [
        {
          network:
            environment.X402_NETWORK === "mainnet"
              ? "disabled-mainnet"
              : "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=",
          asset: "10458941",
          payTo: environment.X402_AVM_ADDRESS,
          facilitatorUrl:
            environment.X402_FACILITATOR_URL ??
            "https://facilitator.goplausible.xyz",
        },
      ];
  if (!Array.isArray(entries))
    throw new Error("X402_NETWORKS must be a JSON array.");
  const networks: PaymentNetwork[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry || entry.enabled === false) continue;
    try {
      const network = entry.network as PaymentNetwork["network"];
      if (!Object.hasOwn(X402.networks, network)) throw new Error();
      const definition = X402.networks[network];
      const payTo = entry.payTo;
      if (typeof payTo !== "string" || !validReceiver(definition.family, payTo))
        throw new Error();
      const asset = entry.asset ?? definition.asset;
      if (
        typeof asset !== "string" ||
        asset.toLowerCase() !== definition.asset.toLowerCase()
      )
        throw new Error();
      const facilitatorUrl = httpUrl(
        entry.facilitatorUrl ?? "https://x402.org/facilitator",
      );
      if (seen.has(definition.family)) throw new Error();
      networks.push({ network, asset, payTo, facilitatorUrl });
      seen.add(definition.family);
    } catch {
      console.warn(
        "An invalid or duplicate x402 network configuration was omitted.",
      );
    }
  }
  if (!networks.length)
    throw new Error("No valid x402 testnet receivers are configured.");
  return { backendBaseUrl, gatewaySecret, networks };
}

function validReceiver(family: "evm" | "svm" | "avm", value: string): boolean {
  if (family === "avm")
    return (
      isValidAlgorandAddress(value) &&
      value !== "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ"
    );
  if (family === "svm")
    return (
      validateSvmAddress(value) && value !== "11111111111111111111111111111111"
    );
  return /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value);
}

function httpUrl(value: string): string {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("x402 URLs require HTTPS, except local HTTP services.");
  }
  return url.toString().replace(/\/$/, "");
}
