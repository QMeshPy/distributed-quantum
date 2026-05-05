"use client";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS, API } from "@/constants";
import { transformNetworkStats } from "../lib/network-transformers";
import type { BackendNetworkStats } from "../types";

export function useNetworkStats() {
  return useQuery({
    queryKey: QUERY_KEYS.network.stats(),
    queryFn: async () => {
      const res = await fetch(API.NETWORK.STATS);
      if (!res.ok) throw new Error("Failed to fetch network stats");
      const data = (await res.json()) as BackendNetworkStats;
      return transformNetworkStats(data);
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
