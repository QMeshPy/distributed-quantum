import type { BackendJobFragmentResult, BackendJobQuantumResult, BackendPlanResponse } from '@/types/backend';

export type FinancialJobStatus = 'QUEUED' | 'INGESTING' | 'ANALYSING' | 'COMPLETED' | 'FAILED';
export type FinancialProblemType = 'portfolio_optimization';

/** Legacy finance-page support types kept optional for older fallback surfaces. */
export interface ColumnProfile {
	name: string;
	dtype: 'numeric' | 'categorical' | 'datetime';
	non_null_count: number;
	null_count: number;
	null_pct: number;
	unique_count: number;
	sample_values: (string | number)[];
	mean?: number;
	median?: number;
	std?: number;
	min?: number;
	max?: number;
	q1?: number;
	q3?: number;
	iqr?: number;
	skewness?: number;
	kurtosis?: number;
	cv?: number;
	outlier_count?: number;
	outlier_pct?: number;
}

export interface CorrelationPair {
	col_a: string;
	col_b: string;
	pearson: number;
	strength: 'strong' | 'moderate' | 'weak';
	direction: 'positive' | 'negative';
}

export interface TimeSeriesInsight {
	column: string;
	trend: 'upward' | 'downward' | 'flat' | 'volatile';
	trend_slope: number;
	volatility: number;
	period_avg: number;
	period_high: number;
	period_low: number;
	momentum: number;
	cagr?: number;
}

export interface ScenarioOutput {
	label: string;
	revenue_projection: number;
	margin_projection: number;
	valuation_estimate: number;
	growth_rate: number;
	discount_rate: number;
	terminal_value: number;
}

export interface DCFOutput {
	wacc: number;
	terminal_growth: number;
	projection_years: number;
	yearly_cashflows: number[];
	terminal_value: number;
	enterprise_value: number;
	equity_value: number;
	per_share_value?: number;
	bull: ScenarioOutput;
	base: ScenarioOutput;
	bear: ScenarioOutput;
}

export interface AnomalyPoint {
	row_index: number;
	column: string;
	value: number;
	z_score: number;
	label: 'extreme_high' | 'extreme_low';
}

export interface NodeExecutionSegment {
	node_id: string;
	task: string;
	rows_processed: number;
	duration_ms: number;
	fidelity_score: number;
}

export interface QuantumFeatureMapping {
	column: string;
	qubit: number;
	mean_rotation: number;
	volatility_rotation: number;
	momentum_rotation: number;
	anomaly_pressure: number;
	correlation_degree: number;
}

export interface QuantumSignalSummary {
	qubit_count: number;
	encoded_columns: string[];
	dominant_state?: string | null;
	dominant_state_probability?: number | null;
	concentration_score: number;
	entanglement_score: number;
	interference_score: number;
	execution_fidelity?: number | null;
	column_activation: Record<string, number>;
}

export interface PortfolioDatasetSummary {
	input_layout: 'long' | 'wide';
	row_count: number;
	col_count: number;
	period_count: number;
	raw_asset_count: number;
	asset_count: number;
	start_date: string;
	end_date: string;
	inferred_frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'unknown';
	return_method: 'simple_returns' | 'provided_returns';
	date_column: string;
	ticker_column?: string | null;
	value_column?: string | null;
	dropped_records: number;
	selected_tickers: string[];
}

export interface PortfolioRequestSummary {
	problem_type: FinancialProblemType;
	budget: number;
	risk_aversion: number;
	penalty: number;
	max_assets_considered: number;
	value_mode: 'auto' | 'prices' | 'returns';
	resolved_value_mode: 'prices' | 'returns';
	qaoa_reps: number;
	parameter_search_steps: number;
	date_column?: string | null;
	ticker_column?: string | null;
	value_column?: string | null;
}

export interface PortfolioAssetMetrics {
	ticker: string;
	periods: number;
	mean_return: number;
	annualized_return: number;
	annualized_variance: number;
	annualized_volatility: number;
	sharpe_like: number;
	selected_classical: boolean;
	selected_quantum: boolean;
	selection_probability: number;
}

export interface PortfolioSelectionSummary {
	bitstring: string;
	selected_assets: string[];
	selected_asset_count: number;
	feasible: boolean;
	budget_gap: number;
	objective: number;
	expected_return: number;
	variance: number;
	volatility: number;
	probability?: number | null;
	rank?: number;
}

export interface PortfolioBenchmarkComparison {
	objective_gap: number;
	objective_ratio?: number | null;
	return_gap: number;
	variance_gap: number;
	overlap_count: number;
	overlap_ratio: number;
	feasible_probability_mass: number;
	optimum_probability?: number | null;
	quantum_advantage_detected: boolean;
}

export interface PortfolioFrontierSummary {
	feasible_portfolio_count: number;
	efficient_frontier: PortfolioSelectionSummary[];
	quantum_rank?: number | null;
	quantum_percentile?: number | null;
	quantum_on_frontier: boolean;
}

export interface PortfolioSolverDiagnostics {
	allocation_model: string;
	screened_asset_count: number;
	budget: number;
	total_binary_states: number;
	feasible_portfolio_count: number;
	classical_solver: {
		strategy: string;
		evaluated_portfolios: number;
	};
	quantum_solver: {
		ansatz: string;
		reps: number;
		strategy: string;
		parameter_evaluations: number;
		coarse_grid_steps: number;
		local_refinement_rounds: number;
		local_refinement_points: number;
	};
}

export interface PortfolioBenchmarkSummary {
	objective_label: string;
	allocation_model?: string;
	classical: PortfolioSelectionSummary;
	quantum: PortfolioSelectionSummary;
	comparison: PortfolioBenchmarkComparison;
	frontier: PortfolioFrontierSummary;
	timings: {
		classical_duration_ms: number;
		quantum_duration_ms: number;
	};
}

export type FinancialComparisonWinner = 'classical' | 'quantum' | 'tie' | 'inconclusive';
export type FinancialComparisonPitchPosition = 'workflow_evidence' | 'mixed' | 'numerical_advantage' | 'not_ready';
export type FinancialComparisonClaimReadiness = 'ready' | 'qualified' | 'not_ready';

export interface FinancialComparisonFairness {
	same_dataset: boolean;
	same_constraints: boolean;
	same_objective: boolean;
	notes: string[];
}

export interface FinancialComparisonDataset {
	input_layout: 'long' | 'wide';
	inferred_frequency: PortfolioDatasetSummary['inferred_frequency'];
	row_count: number;
	col_count: number;
	period_count: number;
	asset_count: number;
	raw_asset_count: number;
	start_date: string;
	end_date: string;
	selected_tickers: string[];
}

export interface FinancialComparisonProblem {
	problem_type: FinancialProblemType;
	objective_label: string;
	allocation_model: string;
	budget: number;
	risk_aversion: number;
	penalty: number;
	qaoa_reps: number;
	parameter_search_steps: number;
	classical_strategy: string;
	quantum_strategy: string;
}

export interface FinancialComparisonClassicalSelection extends PortfolioSelectionSummary {
	duration_ms: number;
	strategy: string;
	evaluated_portfolios: number;
	is_exact_optimum: boolean;
}

export interface FinancialComparisonQuantumSelection extends PortfolioSelectionSummary {
	duration_ms: number;
	strategy: string;
	ansatz: string;
	parameter_evaluations: number;
	feasible_probability_mass: number;
	optimum_probability?: number | null;
	percentile?: number | null;
	on_frontier: boolean;
	plan_id?: string | null;
	fragments_executed: number;
	distributed_nodes_used: number;
	circuit_qubits?: number | null;
	circuit_depth?: number | null;
	circuit_size?: number | null;
	has_qasm: boolean;
	has_runtime_result: boolean;
}

export interface FinancialComparisonScorecard {
	winner_by_objective: FinancialComparisonWinner;
	winner_by_return: FinancialComparisonWinner;
	winner_by_risk: FinancialComparisonWinner;
	winner_by_runtime: FinancialComparisonWinner;
	objective_gap: number;
	objective_ratio?: number | null;
	return_gap: number;
	variance_gap: number;
	overlap_count: number;
	overlap_ratio: number;
	quantum_advantage_detected: boolean;
}

export interface FinancialComparisonEvidence {
	exact_baseline_available: boolean;
	efficient_frontier_points: number;
	top_state_count: number;
	fragment_count: number;
	observed_basis_state_count: number;
	warnings: string[];
}

export interface FinancialComparisonVerdict {
	pitch_position: FinancialComparisonPitchPosition;
	claim_readiness: FinancialComparisonClaimReadiness;
	headline: string;
	summary: string;
	strengths: string[];
	limitations: string[];
	recommended_claims: string[];
	avoid_claims: string[];
}

export interface FinancialComparisonReport {
	job_id: string;
	filename: string;
	generated_at: string;
	fairness: FinancialComparisonFairness;
	dataset: FinancialComparisonDataset;
	problem: FinancialComparisonProblem;
	classical: FinancialComparisonClassicalSelection;
	quantum: FinancialComparisonQuantumSelection;
	scorecard: FinancialComparisonScorecard;
	evidence: FinancialComparisonEvidence;
	verdict: FinancialComparisonVerdict;
}

export interface PortfolioCircuitSummary {
	qubit_count: number;
	depth: number;
	size: number;
	parameter_count: number;
	gate_counts: Record<string, number>;
}

export interface PortfolioHamiltonianField {
	asset: number;
	coefficient: number;
}

export interface PortfolioHamiltonianCoupling {
	asset_i: number;
	asset_j: number;
	coefficient: number;
}

export interface PortfolioHamiltonianSummary {
	offset: number;
	linear_fields: PortfolioHamiltonianField[];
	couplings: PortfolioHamiltonianCoupling[];
	penalty_strategy: string;
}

export interface PortfolioQaoaParameters {
	reps: number;
	beta: number;
	gamma: number;
	parameter_search_steps: number;
}

export interface PortfolioQuantumState {
	bitstring: string;
	selected_assets: string[];
	selected_asset_count: number;
	feasible: boolean;
	budget_gap: number;
	objective: number;
	expected_return: number;
	variance: number;
	volatility: number;
	probability?: number | null;
	rank?: number;
}

export interface FinancialQuantumExecution {
	circuit_text: string;
	encoded_assets?: string[];
	encoded_columns?: string[];
	qaoa_parameters?: PortfolioQaoaParameters;
	circuit_summary?: PortfolioCircuitSummary;
	top_states?: PortfolioQuantumState[];
	hamiltonian?: PortfolioHamiltonianSummary;
	feature_mapping?: QuantumFeatureMapping[];
	plan: BackendPlanResponse;
	fragment_results: BackendJobFragmentResult[];
	quantum_result: BackendJobQuantumResult | null;
	signal_summary?: QuantumSignalSummary;
}

export interface FinancialAnalysisResult {
	job_id: string;
	filename: string;
	problem_type: FinancialProblemType;
	summary: string;
	row_count: number;
	col_count: number;
	dataset: PortfolioDatasetSummary;
	request: PortfolioRequestSummary;
	asset_universe: PortfolioAssetMetrics[];
	benchmark: PortfolioBenchmarkSummary;
	comparison_report?: FinancialComparisonReport;
	solver_diagnostics: PortfolioSolverDiagnostics;
	warnings: string[];
	quantum_execution?: FinancialQuantumExecution | null;
	analysis_duration_ms: number;
	distributed_nodes_used: number;
	fragments_executed: number;
	generated_at: string;
	/** Optional legacy fields kept so fallback run-detail surfaces still compile. */
	numeric_columns: string[];
	categorical_columns: string[];
	datetime_columns: string[];
	column_profiles: ColumnProfile[];
	correlations: CorrelationPair[];
	top_correlations: CorrelationPair[];
	time_series_insights: TimeSeriesInsight[];
	dcf?: DCFOutput;
	anomalies: AnomalyPoint[];
	summary_stats: Record<string, unknown>;
	node_execution: NodeExecutionSegment[];
}

export interface FinancialJobResponse {
	job_id: string;
	problem_type?: string | null;
	status: FinancialJobStatus;
	filename: string;
	row_count?: number;
	col_count?: number;
	error?: string;
	created_at: string;
	updated_at: string;
	result?: FinancialAnalysisResult;
}
