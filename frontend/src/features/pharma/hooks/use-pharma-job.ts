"use client";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS, API } from "@/constants";
import type { PharmaJob } from "../types";

export function usePharmaJob(jobId: string) {
  return useQuery<PharmaJob>({
    queryKey: QUERY_KEYS.pharma.job(jobId),
    queryFn: async () => {
      const res = await fetch(API.PHARMA.JOB(jobId));
      if (!res.ok) throw new Error(`Pharma job ${jobId} not found`);
      return res.json() as Promise<PharmaJob>;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "queued" || status === "running") return 3_000;
      return false;
    },
    enabled: !!jobId,
  });
}
