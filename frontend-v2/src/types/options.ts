export type OptionType =
	| 'european_call_short'
	| 'european_call_long'
	| 'expand'
	| 'delay'
	| 'abandon'
	| 'patent'
	| 'natural_resource'
	| 'financial_flexibility';

export type OptionsJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type Moneyness = 'ITM' | 'ATM' | 'OTM';

export interface OptionsGreeks {
	delta: number;
	gamma: number;
	vega: number;
	theta: number;
}

export interface OptionsAnalysisResult {
	job_id: string;
	option_type: OptionType;
	request: Record<string, unknown>;

	// Pricing
	quantum_price: number;
	classical_bs_price: number;
	classical_binomial_price: number;
	price_difference_pct: number;

	// Greeks
	quantum_greeks: OptionsGreeks;
	classical_greeks: OptionsGreeks;

	// Confidence interval [lower, upper]
	confidence_interval: [number, number];

	// Moneyness
	moneyness: Moneyness;
	moneyness_ratio: number;

	// Flags
	divergence_warning: boolean;
	sigma_zero_fallback: boolean;

	// Circuit metadata
	num_qubits: number;
	circuit_depth: number;
	num_iqae_runs: number;
	shots_per_run: number;
	epsilon: number;
	alpha: number;

	// Quantum advantage evidence
	classical_mc_samples_equivalent: number;
	quadratic_speedup_factor: number;

	// Timing
	analysis_duration_ms: number;
	generated_at: string;
}

export interface OptionsJobResponse {
	job_id: string;
	option_type: string;
	status: OptionsJobStatus;
	error?: string | null;
	result?: OptionsAnalysisResult | null;
	created_at: string;
	updated_at: string;
}

export interface OptionsJobSummary {
	job_id: string;
	option_type: string;
	status: OptionsJobStatus;
	error?: string | null;
	created_at: string;
	updated_at: string;
}

export interface OptionsSubmitRequest {
	option_type: OptionType;
	current_value: number;
	strike_or_cost: number;
	time_to_expiry: number;
	volatility: number;
	risk_free_rate: number;
	// Short-term extras
	dividend_per_share?: number | null;
	days_to_ex_dividend?: number | null;
	// Real option extras
	annual_cost_of_delay?: number | null;
	// Natural resource extras
	reserve_quantity?: number | null;
	resource_price_per_unit?: number | null;
	extraction_cost_per_unit?: number | null;
	annual_cashflow_after_tax?: number | null;
	// Financial flexibility extras
	reinvestment_need_pct?: number | null;
	reinvestment_volatility?: number | null;
	max_internal_financing_pct?: number | null;
	cost_of_capital?: number | null;
	return_on_capital?: number | null;
	// IQAE config
	num_uncertainty_qubits?: number;
	epsilon?: number;
	alpha?: number;
}

/** Labels for each option type shown in the UI. */
export const OPTION_TYPE_LABELS: Record<OptionType, string> = {
	european_call_short: 'European Call (Short-term)',
	european_call_long: 'European Call (Long-term)',
	expand: 'Option to Expand',
	delay: 'Option to Delay',
	abandon: 'Option to Abandon',
	patent: 'Patent / R&D Project',
	natural_resource: 'Natural Resource',
	financial_flexibility: 'Financial Flexibility'
};

/** Damodaran spreadsheet reference for each option type. */
export const OPTION_TYPE_DAMODARAN: Record<OptionType, string> = {
	european_call_short: 'optst.xls',
	european_call_long: 'optlt.xls',
	expand: 'expand.xls',
	delay: 'delay.xls',
	abandon: 'abandon.xls',
	patent: 'project.xls',
	natural_resource: 'natres.xls',
	financial_flexibility: 'flexval.xls'
};

/** Contextual labels for S and K inputs, per option type. */
export const OPTION_TYPE_INPUT_LABELS: Record<OptionType, { s: string; k: string }> = {
	european_call_short: { s: 'Current stock price (S₀)', k: 'Strike price (K)' },
	european_call_long: { s: 'Current stock price (S₀)', k: 'Strike price (K)' },
	expand: { s: 'PV of expanded business', k: 'Investment cost' },
	delay: { s: 'PV of project cash flows', k: 'Required investment' },
	abandon: { s: 'PV of continuing cash flows', k: 'Salvage value' },
	patent: { s: 'PV of net cash flows from product', k: 'R&D / development cost' },
	natural_resource: { s: 'Current price per unit', k: 'Development cost' },
	financial_flexibility: { s: 'Reinvestment need (% of firm value)', k: 'Max internal financing capacity' }
};
