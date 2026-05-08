"use client";

import { useQuery } from "@tanstack/react-query";
import { API, QUERY_KEYS } from "@/constants";
import type { PinMetadata } from "../types";

export function usePinMetadata(cid: string | null) {
  return useQuery<PinMetadata | null>({
    queryKey: QUERY_KEYS.vault.pinMetadata(cid ?? ""),
    queryFn: async () => {
      if (!cid) return null;
      const res = await fetch(API.VAULT.PIN_METADATA(cid));
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.pinned) return null;
      return {
        cid,
        service: data.service,
        pinnedAt: new Date(data.pinnedAt),
        size: data.size,
      };
    },
    enabled: !!cid,
    staleTime: 60_000,
  });
}
