"use client";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS, API, CONFIG } from "@/constants";
import { useTrialEnabled } from "@/shared/hooks/use-trial-enabled";
import type { BackendRiskJobResponse, RiskJobDetail, VaRResult } from "../types";

function transform(raw: BackendRiskJobResponse): RiskJobDetail {
  return {
    jobId: raw.job_id,
    status: raw.status,
    riskModel: raw.risk_model,
    portfolioSize: raw.portfolio_size,
    error: raw.error,
    result: raw.result
      ? {
          tickers: raw.result.tickers,
          weights: raw.result.weights,
          varResults: raw.result.var_results.map(
            (v): VaRResult => ({
              confidenceLevel: v.confidence_level,
              quantumVar: v.quantum_var,
              classicalMcVar: v.classical_mc_var,
              quantumCi: v.quantum_ci,
              deviationPct: v.deviation_pct,
            }),
          ),
          quantumCvar99: raw.result.quantum_cvar_99,
          classicalMcCvar99: raw.result.classical_mc_cvar_99,
          expectedLoss: raw.result.expected_loss,
          economicCapital: raw.result.economic_capital,
          lossDistributionQuantum: raw.result.loss_distribution_quantum,
          lossDistributionClassical: raw.result.loss_distribution_classical,
          lossDistributionBins: raw.result.loss_distribution_bins,
          quadraticSpeedupFactor: raw.result.quadratic_speedup_factor,
          classicalMcSamplesEquivalent: raw.result.classical_mc_samples_equivalent,
          numQubits: raw.result.num_qubits,
          circuitDepth: raw.result.circuit_depth,
          numIqaeCalls: raw.result.num_iqae_calls,
          analysisDurationMs: raw.result.analysis_duration_ms,
          generatedAt: raw.result.generated_at,
        }
      : null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function useRiskJob(jobId: string) {
  const enabled = useTrialEnabled();
  return useQuery<RiskJobDetail>({
    queryKey: QUERY_KEYS.risk.job(jobId),
    queryFn: async () => {
      const res = await fetch(API.RISK.JOB(jobId));
      if (!res.ok) throw new Error("Failed to fetch risk job");
      const data = (await res.json()) as BackendRiskJobResponse;
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
