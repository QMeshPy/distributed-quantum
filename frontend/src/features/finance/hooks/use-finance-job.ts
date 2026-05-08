"use client";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS, API, CONFIG } from "@/constants";
import { useTrialEnabled } from "@/shared/hooks/use-trial-enabled";
import type { BackendFinancialJobResponse, FinanceJobDetail } from "../types";

function transform(raw: BackendFinancialJobResponse): FinanceJobDetail {
  return {
    jobId: raw.job_id,
    filename: raw.filename,
    problemType: raw.problem_type,
    status: raw.status,
    rowCount: raw.row_count,
    colCount: raw.col_count,
    error: raw.error,
    result: raw.result,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function useFinanceJob(jobId: string) {
  const enabled = useTrialEnabled();
  return useQuery<FinanceJobDetail>({
    queryKey: QUERY_KEYS.finance.job(jobId),
    queryFn: async () => {
      const res = await fetch(API.FINANCE.JOB(jobId));
      if (!res.ok) throw new Error("Failed to fetch finance job");
      const data = (await res.json()) as BackendFinancialJobResponse;
      return transform(data);
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && CONFIG.POLL_STOP_STATUSES.includes(status)) return false;
      return 2000;
    },
    staleTime: 0,
    enabled,
  });
}
