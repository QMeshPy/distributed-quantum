"use client";
import { useQuery } from "@tanstack/react-query";
import { API } from "@/constants";
import type { CircuitPlan } from "@/features/finance/components/circuit-fragment-flow";

export function useRunPlan(planId: string | null | undefined) {
  return useQuery<CircuitPlan | null>({
    queryKey: ["runs", "plan", planId],
    queryFn: async () => {
      if (!planId) return null;
      const res = await fetch(API.RUNS.PLAN(planId));
      if (!res.ok) return null;
      return (await res.json()) as CircuitPlan;
    },
    enabled: !!planId,
    staleTime: 60_000,
  });
}
