import "server-only";

import { ExactAvmScheme } from "@x402/avm/exact/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { validateSvmAddress } from "@x402/svm";
import { isValidAlgorandAddress } from "@x402/avm";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { X402 } from "../../../constants/x402";
import type { PaymentNetwork } from "./networks";

export async function supportedServers(networks: PaymentNetwork[]) {
  const results = await Promise.allSettled(
    networks.map(async (network) => {
      const client = new HTTPFacilitatorClient({
        url: network.facilitatorUrl,
        timeoutMs: X402.timeoutMs,
      });
      const server = new x402ResourceServer(client);
      const family = X402.networks[network.network].family;
      const scheme =
        family === "evm"
          ? new ExactEvmScheme()
          : family === "svm"
            ? new ExactSvmScheme()
            : new ExactAvmScheme();
      server.register(network.network, scheme);
      await server.initialize();
      const supported = server.getSupportedKind(2, network.network, "exact");
      if (!supported) return null;
      const feePayer = supported.extra?.feePayer;
      if (
        (family === "svm" &&
          (typeof feePayer !== "string" || !validateSvmAddress(feePayer))) ||
        (family === "avm" && feePayer !== undefined &&
          (typeof feePayer !== "string" || !isValidAlgorandAddress(feePayer)))
      ) return null;
      return { server, network };
    }),
  );
  return results.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : [],
  );
}
