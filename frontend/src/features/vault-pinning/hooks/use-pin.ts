"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API, QUERY_KEYS } from "@/constants";
import type { PinningService } from "../types";
import { estimateSize } from "../lib/estimate-size";
import { enqueue } from "../lib/sync-queue";

export function usePin() {
  const [pinning, setPinning] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const queryClient = useQueryClient();

  const pin = async (
    cid: string,
    type: "circuit" | "run",
    metadata: Record<string, unknown>,
    service: PinningService = "nft.storage",
  ): Promise<{ gatewayCid: string }> => {
    setPinning(true);
    setError(null);

    const size = estimateSize(metadata);

    try {
      // Upload first so a failed upload is never recorded as pinned.
      // Pinata/Lighthouse re-encode JSON and return a gateway-reachable CID
      // that may differ from the local Helia CID — that gateway CID is what
      // another browser must open on /vault/cid/[cid].
      const { getProvider } = await import("../services");
      const result = await getProvider(service).pin(cid, metadata);
      const gatewayCid = result.cid || cid;

      const res = await fetch(API.VAULT.PIN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cid,
          service,
          action: "pin",
          size: result.size,
          sizeSource: "actual",
          type,
          metadata,
        }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to record pin");
      }

      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vault.quota(service) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vault.pinMetadata(cid) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vault.pins() });

      return { gatewayCid };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);

      if (e.message.includes("Failed to record pin")) {
        enqueue({ cid, service, action: "pin", size, type, metadata });
      }

      throw e;
    } finally {
      setPinning(false);
    }
  };

  const unpin = async (
    cid: string,
    service: PinningService,
    hardDelete: boolean,
  ): Promise<void> => {
    setPinning(true);
    setError(null);

    try {
      if (hardDelete) {
        const { getProvider } = await import("../services");
        const provider = getProvider(service);
        await provider.unpin(cid);
      }

      await fetch(API.VAULT.PIN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cid,
          service,
          action: "unpin",
          size: 0,
          sizeSource: "actual",
          type: "circuit",
          metadata: {},
        }),
      });

      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vault.quota(service) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vault.pinMetadata(cid) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vault.pins() });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setPinning(false);
    }
  };

  return { pin, unpin, pinning, error };
}
