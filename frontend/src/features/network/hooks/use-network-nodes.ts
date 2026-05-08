"use client";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/constants";
import { transformPeerSummary } from "../lib/network-transformers";
import type { BackendPeerListResponse } from "../types";

export function useNetworkNodes() {
  return useQuery({
    queryKey: QUERY_KEYS.network.nodes(),
    queryFn: async () => {
      const res = await fetch("/api/network/peers");
      if (!res.ok) throw new Error("Failed to fetch nodes");
      const data = (await res.json()) as BackendPeerListResponse;
      return data.peers.map(transformPeerSummary);
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
