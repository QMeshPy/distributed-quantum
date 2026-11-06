export type TokenKind = "native" | "stablecoin";

export interface HoldingSource {
  kind: string;
  detail: string;
  observed_at: string;
}

export interface PricedHolding {
  network: string;
  chain_id: string;
  symbol: string;
  kind: TokenKind;
  token_address: string | null;
  balance: string;
  decimals: number;
  price_usd: string;
  value_usd: string;
  weight: number;
  source: HoldingSource;
}

export interface UnpriceableHolding {
  network: string;
  chain_id: string;
  symbol: string;
  kind: TokenKind;
  token_address: string | null;
  balance: string;
  decimals: number;
  reason: string;
  observed_at: string;
}

export interface WalletPortfolioRiskSummary {
  portfolio_value_usd: number;
  classical_var_95: number;
  classical_var_99: number;
  classical_cvar_99: number;
  quantum_var_95: number | null;
  quantum_var_99: number | null;
  quantum_cvar_99: number | null;
  confidence_note: string;
}

export interface WalletPortfolioAnalysis {
  address: string;
  analyzed_at: string;
  networks: string[];
  priced_holdings: PricedHolding[];
  unpriceable_holdings: UnpriceableHolding[];
  risk: WalletPortfolioRiskSummary | null;
  data_sources: HoldingSource[];
  notes: string[];
}

export interface WalletPortfolioRequest {
  address: string;
  networks?: string[];
  lookback_days?: number;
  num_uncertainty_qubits?: number;
  epsilon?: number;
  alpha?: number;
}
