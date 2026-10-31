import type { PinningService } from "../types";

export const DEFAULT_SERVICE: PinningService = "pinata";

export const SERVICE_LABELS: Record<PinningService, string> = {
  lighthouse: "Filecoin (via Lighthouse)",
  pinata: "Pinata",
  "nft.storage": "Pinata (legacy)",
};
