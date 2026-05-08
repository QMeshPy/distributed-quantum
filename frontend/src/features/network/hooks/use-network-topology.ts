"use client";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/constants";
import { transformTopology } from "../lib/network-transformers";
import type { BackendTopologyResponse } from "../types";

export function useNetworkTopology() {
  return useQuery({
    queryKey: QUERY_KEYS.network.topology(),
    queryFn: async () => {
      const res = await fetch("/api/network/topology");
      if (!res.ok) throw new Error("Failed to fetch topology");
      const data = (await res.json()) as BackendTopologyResponse;
      return transformTopology(data);
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
