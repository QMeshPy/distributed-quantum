"use client";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS, API } from "@/constants";
import { transformRunDetail, isTerminalStatus } from "../lib/run-transformers";
import type { BackendJobDetail } from "../types";

export function useRunDetail(jobId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.runs.detail(jobId),
    queryFn: async () => {
      const res = await fetch(API.RUNS.DETAIL(jobId));
      if (!res.ok) throw new Error("Run not found");
      const data = (await res.json()) as BackendJobDetail;
      return transformRunDetail(data);
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && isTerminalStatus(status) ? false : 3000;
    },
    staleTime: 0,
  });
}
