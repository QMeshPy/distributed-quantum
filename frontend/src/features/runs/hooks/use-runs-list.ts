"use client";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS, API } from "@/constants";
import { useTrialEnabled } from "@/shared/hooks/use-trial-enabled";
import { transformRunSummary } from "../lib/run-transformers";
import type { BackendJobListItem } from "../types";

export function useRunsList() {
  const enabled = useTrialEnabled();
  return useQuery({
    queryKey: QUERY_KEYS.runs.list(),
    queryFn: async () => {
      const res = await fetch(API.RUNS.LIST);
      if (!res.ok) throw new Error("Failed to fetch runs");
      const data = (await res.json()) as BackendJobListItem[];
      return data.map(transformRunSummary);
    },
    staleTime: 15_000,
    enabled,
  });
}
