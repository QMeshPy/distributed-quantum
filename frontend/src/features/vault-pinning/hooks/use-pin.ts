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
  ): Promise<void> => {
    setPinning(true);
    setError(null);

    const size = estimateSize(metadata);

    try {
      const res = await fetch(API.VAULT.PIN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cid,
          service,
          action: "pin",
          size,
          sizeSource: "estimated",
          type,
          metadata,
        }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to record pin");
      }

      const { getProvider } = await import("../services");
      const provider = getProvider(service);
      const result = await provider.pin(cid);

      await fetch(API.VAULT.UNPIN(cid), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service,
          size: result.size,
          sizeSource: "actual",
          syncStatus: "synced",
        }),
      });

      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vault.quota(service) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vault.pinMetadata(cid) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vault.pins() });
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
