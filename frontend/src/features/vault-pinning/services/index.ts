import type { PinningProvider, PinningService } from "../types";
import { nftStorageProvider } from "./nft-storage";

const providers = new Map<PinningService, PinningProvider>([
  ["nft.storage", nftStorageProvider],
]);

export function getProvider(service: PinningService): PinningProvider {
  const provider = providers.get(service);
  if (!provider) throw new Error(`Unknown pinning service: ${service}`);
  return provider;
}

export function getAllProviders(): PinningProvider[] {
  return Array.from(providers.values());
}
