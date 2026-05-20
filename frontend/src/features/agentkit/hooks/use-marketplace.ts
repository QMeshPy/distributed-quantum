import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS_AGENTKIT } from "@/constants/query-keys";
import { API_AGENTKIT } from "@/constants/api";
import type { MarketplaceAgent } from "../types";

export function useMarketplace(search?: string) {
  return useQuery<MarketplaceAgent[]>({
    queryKey: [...QUERY_KEYS_AGENTKIT.marketplace(), search],
    queryFn: async () => {
      const url = search
        ? `${API_AGENTKIT.MARKETPLACE}?search=${encodeURIComponent(search)}`
        : API_AGENTKIT.MARKETPLACE;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch marketplace");
      const data = await res.json();
      return Array.isArray(data) ? data : (data.agents ?? data.workers ?? []);
    },
    staleTime: 60_000,
  });
}
