export type RiskModel = "equity" | "credit";

// --- Backend (snake_case) types ---

export interface BackendEquityHolding {
  ticker: string;
  weight: number;
}

export interface BackendCreditAsset {
  loan_id: string;
  principal: number;
  default_probability: number;
  recovery_rate: number;
  sensitivity_rho: number;
  sector: string;
}

export interface BackendRiskJobRequest {
  risk_model: RiskModel;
  holdings?: BackendEquityHolding[];
  lookback_days?: number;
  assets?: BackendCreditAsset[];
  n_z_qubits?: number;
  num_uncertainty_qubits?: number;
  epsilon?: number;
  alpha?: number;
}

export interface BackendRiskVaRResult {
  confidence_level: number;
  quantum_var: number;
  classical_mc_var: number;
  quantum_ci: [number, number];
  deviation_pct: number;
}

export interface BackendRiskAnalysisResult {
  job_id: string;
  risk_model: RiskModel;
  portfolio_size: number;
  tickers: string[];
  weights: number[];
  var_results: BackendRiskVaRResult[];
  quantum_cvar_99: number;
  classical_mc_cvar_99: number;
  expected_loss: number;
  economic_capital: number | null;
  loss_distribution_quantum: number[];
  loss_distribution_classical: number[];
  loss_distribution_bins: number[];
  quadratic_speedup_factor: number;
  classical_mc_samples_equivalent: number;
  num_qubits: number;
  circuit_depth: number;
  num_iqae_calls: number;
  analysis_duration_ms: number;
  generated_at: string;
}

export interface BackendRiskSubmitResponse {
  job_id: string;
  status: string;
  risk_model: RiskModel;
  portfolio_size: number;
}

export interface BackendRiskJobSummary {
  job_id: string;
  status: string;
  risk_model: string;
  portfolio_size: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackendRiskJobResponse {
  job_id: string;
  status: string;
  risk_model: string;
  portfolio_size: number;
  result: BackendRiskAnalysisResult | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// --- UI-facing camelCase types ---

export interface RiskJobSummary {
  jobId: string;
  status: string;
  riskModel: string;
  portfolioSize: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VaRResult {
  confidenceLevel: number;
  quantumVar: number;
  classicalMcVar: number;
  quantumCi: [number, number];
  deviationPct: number;
}

export interface RiskJobDetail {
  jobId: string;
  status: string;
  riskModel: string;
  portfolioSize: number;
  error: string | null;
  result: {
    tickers: string[];
    weights: number[];
    varResults: VaRResult[];
    quantumCvar99: number;
    classicalMcCvar99: number;
    expectedLoss: number;
    economicCapital: number | null;
    lossDistributionQuantum: number[];
    lossDistributionClassical: number[];
    lossDistributionBins: number[];
    quadraticSpeedupFactor: number;
    classicalMcSamplesEquivalent: number;
    numQubits: number;
    circuitDepth: number;
    numIqaeCalls: number;
    analysisDurationMs: number;
    generatedAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}
