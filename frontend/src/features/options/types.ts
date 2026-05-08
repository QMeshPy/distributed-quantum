export type OptionType =
  | "european_call_short"
  | "european_call_long"
  | "expand"
  | "delay"
  | "abandon"
  | "patent"
  | "natural_resource"
  | "financial_flexibility";

export type Moneyness = "ITM" | "ATM" | "OTM";

// --- Backend (snake_case) types ---

export interface BackendOptionsJobRequest {
  option_type: OptionType;
  current_value: number;
  strike_or_cost: number;
  time_to_expiry: number;
  volatility: number;
  risk_free_rate: number;
  dividend_per_share?: number | null;
  days_to_ex_dividend?: number | null;
  annual_cost_of_delay?: number | null;
  reserve_quantity?: number | null;
  resource_price_per_unit?: number | null;
  extraction_cost_per_unit?: number | null;
  annual_cashflow_after_tax?: number | null;
  reinvestment_need_pct?: number | null;
  reinvestment_volatility?: number | null;
  max_internal_financing_pct?: number | null;
  cost_of_capital?: number | null;
  return_on_capital?: number | null;
  num_uncertainty_qubits?: number;
  epsilon?: number;
  alpha?: number;
}

export interface BackendOptionsGreeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
}

export interface BackendOptionsResult {
  job_id: string;
  option_type: OptionType;
  request: Record<string, unknown>;
  quantum_price: number;
  classical_bs_price: number;
  classical_binomial_price: number;
  price_difference_pct: number;
  quantum_greeks: BackendOptionsGreeks;
  classical_greeks: BackendOptionsGreeks;
  confidence_interval: [number, number];
  moneyness: Moneyness;
  moneyness_ratio: number;
  divergence_warning: boolean;
  sigma_zero_fallback: boolean;
  num_qubits: number;
  circuit_depth: number;
  num_iqae_runs: number;
  shots_per_run: number;
  epsilon: number;
  alpha: number;
  classical_mc_samples_equivalent: number;
  quadratic_speedup_factor: number;
  analysis_duration_ms: number;
  generated_at: string;
}

export interface BackendOptionsJobResponse {
  job_id: string;
  option_type: string;
  status: string;
  error: string | null;
  result: BackendOptionsResult | null;
  created_at: string;
  updated_at: string;
}

export interface BackendOptionsJobSummary {
  job_id: string;
  option_type: string;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackendBatchRowResult {
  row_index: number;
  option_type: string;
  current_value: number;
  strike_or_cost: number;
  time_to_expiry: number;
  volatility: number;
  risk_free_rate: number;
  market_price: number | null;
  quantum_price: number;
  classical_bs_price: number;
  classical_binomial_price: number;
  price_difference_pct: number;
  quantum_vs_market_pct: number | null;
  bs_vs_market_pct: number | null;
  quantum_delta: number;
  classical_delta: number;
  confidence_interval: [number, number];
  moneyness: string;
  divergence_warning: boolean;
  num_qubits: number;
  analysis_duration_ms: number;
}

export interface BackendBatchSummary {
  total_rows: number;
  succeeded: number;
  failed: number;
  mean_quantum_bs_diff_pct: number;
  mean_quantum_vs_market_pct: number | null;
  mean_bs_vs_market_pct: number | null;
  rows_with_divergence_warning: number;
  total_duration_ms: number;
}

export interface BackendBatchResult {
  rows: BackendBatchRowResult[];
  errors: Array<{ row_index: number; error: string }>;
  summary: BackendBatchSummary;
}

// --- UI-facing camelCase types ---

export interface OptionsGreeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
}

export interface OptionsJobSummary {
  jobId: string;
  optionType: string;
  status: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OptionsJobDetail {
  jobId: string;
  optionType: string;
  status: string;
  error: string | null;
  result: {
    quantumPrice: number;
    classicalBsPrice: number;
    classicalBinomialPrice: number;
    priceDifferencePct: number;
    quantumGreeks: OptionsGreeks;
    classicalGreeks: OptionsGreeks;
    confidenceInterval: [number, number];
    moneyness: Moneyness;
    moneynessRatio: number;
    divergenceWarning: boolean;
    sigmaZeroFallback: boolean;
    numQubits: number;
    circuitDepth: number;
    numIqaeRuns: number;
    shotsPerRun: number;
    epsilon: number;
    alpha: number;
    classicalMcSamplesEquivalent: number;
    analysisDurationMs: number;
    quadraticSpeedupFactor: number;
    request: Record<string, unknown>;
    generatedAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}
