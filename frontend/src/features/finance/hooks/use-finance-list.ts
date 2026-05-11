"use client";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS, API } from "@/constants";
import type { BackendFinancialJobSummary, FinanceJobSummary } from "../types";

function transform(raw: BackendFinancialJobSummary): FinanceJobSummary {
  return {
    jobId: raw.job_id,
    filename: raw.filename,
    problemType: raw.problem_type,
    status: raw.status,
    rowCount: raw.row_count,
    colCount: raw.col_count,
    error: raw.error,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function useFinanceList() {
  return useQuery<FinanceJobSummary[]>({
    queryKey: QUERY_KEYS.finance.list(),
    queryFn: async () => {
      const res = await fetch(API.FINANCE.LIST);
      if (!res.ok) throw new Error("Failed to fetch finance list");
      const data = (await res.json()) as BackendFinancialJobSummary[];
      return data.map(transform);
    },
    staleTime: 0,
    refetchInterval: (query) => {
      const data = query.state.data ?? [];
      return data.some((j) => j.status === "queued" || j.status === "running" || j.status === "compiling" || j.status === "executing") ? 5_000 : 30_000;
    },
  });
}
