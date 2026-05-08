"use client";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS, API } from "@/constants";
import { useTrialEnabled } from "@/shared/hooks/use-trial-enabled";
import type { DashboardNetworkStats, DashboardSnapshot } from "../types";

export type DashboardStatsResult = Pick<
  DashboardSnapshot,
  "networkStats" | "health" | "warnings"
> & {
  totalNodes: number;
  activeServices: number;
  avgFidelity: number;
  totalQubits: number;
  networkStats: DashboardNetworkStats;
};

export function useDashboardStats() {
  const enabled = useTrialEnabled();
  return useQuery<DashboardStatsResult>({
    queryKey: QUERY_KEYS.dashboard.stats(),
    queryFn: async () => {
      const res = await fetch(API.DASHBOARD.STATS);
      if (!res.ok) throw new Error("Failed to fetch dashboard stats");
      return res.json() as Promise<DashboardStatsResult>;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled,
  });
}
