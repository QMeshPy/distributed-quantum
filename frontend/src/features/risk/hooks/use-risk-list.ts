"use client";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS, API } from "@/constants";
import type { BackendRiskJobSummary, RiskJobSummary } from "../types";

function transform(raw: BackendRiskJobSummary): RiskJobSummary {
  return {
    jobId: raw.job_id,
    status: raw.status,
    riskModel: raw.risk_model,
    portfolioSize: raw.portfolio_size,
    error: raw.error,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function useRiskList() {
  return useQuery<RiskJobSummary[]>({
    queryKey: QUERY_KEYS.risk.list(),
    queryFn: async () => {
      const res = await fetch(API.RISK.LIST);
      if (!res.ok) throw new Error("Failed to fetch risk list");
      const data = (await res.json()) as BackendRiskJobSummary[];
      return data.map(transform);
    },
    staleTime: 0,
    refetchInterval: (query) => {
      const data = query.state.data ?? [];
      return data.some((j) => j.status === "queued" || j.status === "running" || j.status === "compiling" || j.status === "executing") ? 5_000 : 30_000;
    },
  });
}
