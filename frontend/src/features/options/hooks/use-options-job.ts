"use client";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS, API, CONFIG } from "@/constants";
import { useTrialEnabled } from "@/shared/hooks/use-trial-enabled";
import type {
  BackendOptionsJobResponse,
  OptionsJobDetail,
} from "../types";

function transform(raw: BackendOptionsJobResponse): OptionsJobDetail {
  return {
    jobId: raw.job_id,
    optionType: raw.option_type,
    status: raw.status,
    error: raw.error,
    result: raw.result
      ? {
          quantumPrice: raw.result.quantum_price,
          classicalBsPrice: raw.result.classical_bs_price,
          classicalBinomialPrice: raw.result.classical_binomial_price,
          priceDifferencePct: raw.result.price_difference_pct,
          quantumGreeks: {
            delta: raw.result.quantum_greeks.delta,
            gamma: raw.result.quantum_greeks.gamma,
            vega: raw.result.quantum_greeks.vega,
            theta: raw.result.quantum_greeks.theta,
          },
          classicalGreeks: {
            delta: raw.result.classical_greeks.delta,
            gamma: raw.result.classical_greeks.gamma,
            vega: raw.result.classical_greeks.vega,
            theta: raw.result.classical_greeks.theta,
          },
          confidenceInterval: raw.result.confidence_interval,
          moneyness: raw.result.moneyness,
          moneynessRatio: raw.result.moneyness_ratio,
          divergenceWarning: raw.result.divergence_warning,
          sigmaZeroFallback: raw.result.sigma_zero_fallback,
          numQubits: raw.result.num_qubits,
          circuitDepth: raw.result.circuit_depth,
          numIqaeRuns: raw.result.num_iqae_runs,
          shotsPerRun: raw.result.shots_per_run,
          epsilon: raw.result.epsilon,
          alpha: raw.result.alpha,
          classicalMcSamplesEquivalent: raw.result.classical_mc_samples_equivalent,
          analysisDurationMs: raw.result.analysis_duration_ms,
          quadraticSpeedupFactor: raw.result.quadratic_speedup_factor,
          request: raw.result.request ?? {},
          generatedAt: raw.result.generated_at,
        }
      : null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function useOptionsJob(jobId: string) {
  const enabled = useTrialEnabled();
  return useQuery<OptionsJobDetail>({
    queryKey: QUERY_KEYS.options.job(jobId),
    queryFn: async () => {
      const res = await fetch(API.OPTIONS.JOB(jobId));
      if (!res.ok) throw new Error("Failed to fetch options job");
      const data = (await res.json()) as BackendOptionsJobResponse;
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
