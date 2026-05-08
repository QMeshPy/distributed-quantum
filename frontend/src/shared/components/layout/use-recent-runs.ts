"use client";

import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS, API } from "@/constants";
import { useTrialEnabled } from "@/shared/hooks/use-trial-enabled";

type RecentRun = {
  jobId: string;
  status: string;
  circuitPreview: string;
  createdAt: string;
};

type BackendItem = {
  job_id: string;
  status: string;
  circuit_preview: string;
  created_at: string;
};

export function useRecentRuns(enabled: boolean) {
  const trialEnabled = useTrialEnabled();
  return useQuery({
    queryKey: QUERY_KEYS.runs.list(),
    queryFn: async (): Promise<RecentRun[]> => {
      const res = await fetch(API.RUNS.LIST);
      if (!res.ok) return [];
      const data = (await res.json()) as BackendItem[];
      return data
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        )
        .slice(0, 5)
        .map((item) => ({
          jobId: item.job_id,
          status: item.status,
          circuitPreview: item.circuit_preview,
          createdAt: item.created_at,
        }));
    },
    staleTime: 30_000,
    enabled: enabled && trialEnabled,
  });
}
