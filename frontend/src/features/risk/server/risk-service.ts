import "server-only";
import { cache } from "react";
import { BACKEND } from "@/constants";
import type {
  BackendRiskJobResponse,
  BackendRiskJobSummary,
  RiskJobDetail,
  RiskJobSummary,
  VaRResult,
} from "../types";

function transformSummary(raw: BackendRiskJobSummary): RiskJobSummary {
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

function transformDetail(raw: BackendRiskJobResponse): RiskJobDetail {
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

export const getRiskList = cache(async (): Promise<RiskJobSummary[] | null> => {
  try {
    const res = await fetch(BACKEND.RISK.LIST, { next: { revalidate: 30 } });
    if (!res.ok) return null;
    const data = (await res.json()) as BackendRiskJobSummary[];
    return data.map(transformSummary);
  } catch {
    return null;
  }
});

export const getRiskJob = cache(
  async (jobId: string): Promise<RiskJobDetail | null> => {
    try {
      const res = await fetch(BACKEND.RISK.DETAIL(jobId), {
        next: { revalidate: 5 },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as BackendRiskJobResponse;
      return transformDetail(data);
    } catch {
      return null;
    }
  },
);
