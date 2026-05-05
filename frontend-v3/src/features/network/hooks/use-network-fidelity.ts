"use client";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/constants";
import { transformFidelityMetrics, transformService } from "../lib/network-transformers";
import type { BackendFidelityMetrics, BackendServiceResponse } from "../types";

export function useNetworkFidelity(nodeId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.network.fidelity(nodeId),
    queryFn: async () => {
      const res = await fetch(`/api/network/fidelity/${nodeId}`);
      if (!res.ok) throw new Error("Failed to fetch fidelity");
      const data = (await res.json()) as BackendFidelityMetrics;
      return transformFidelityMetrics(data);
    },
    staleTime: 30_000,
    enabled: !!nodeId,
  });
}

export function useNetworkServices() {
  return useQuery({
    queryKey: QUERY_KEYS.network.services(),
    queryFn: async () => {
      const res = await fetch("/api/network/services");
      if (!res.ok) throw new Error("Failed to fetch services");
      const data = (await res.json()) as BackendServiceResponse[];
      return data.map(transformService);
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
