"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API, QUERY_KEYS } from "@/constants";
import type { PinningService } from "../types";

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

    try {
      const res = await fetch(API.VAULT.PIN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cid,
          service,
          action: "pin",
          type,
          metadata,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to pin");

      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vault.quota(service) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vault.pinMetadata(cid) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vault.pins() });

      return { gatewayCid: result.gatewayCid };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);

      throw e;
    } finally {
      setPinning(false);
    }
  };

  const unpin = async (
    cid: string,
    service: PinningService,
  ): Promise<void> => {
    setPinning(true);
    setError(null);

    try {
      const res = await fetch(API.VAULT.PIN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cid,
          service,
          action: "unpin",
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to unpin");

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
