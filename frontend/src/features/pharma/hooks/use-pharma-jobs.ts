"use client";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS, API } from "@/constants";
import type { PharmaJob } from "../types";

export function usePharmaJobs() {
  return useQuery<PharmaJob[]>({
    queryKey: QUERY_KEYS.pharma.list(),
    queryFn: async () => {
      const res = await fetch(API.PHARMA.LIST);
      if (!res.ok) throw new Error("Failed to load pharma jobs");
      return res.json() as Promise<PharmaJob[]>;
    },
    staleTime: 0,
    refetchInterval: (query) => {
      const data = query.state.data ?? [];
      return data.some((j) => j.status === "queued" || j.status === "running") ? 5_000 : 30_000;
    },
  });
}
