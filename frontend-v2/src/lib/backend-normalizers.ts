import type { BackendJobFragmentResult, BackendJobQuantumResult, BackendPlanResponse } from '@/types/backend';
import type {
	FinancialAnalysisResult,
	FinancialComparisonClaimReadiness,
	FinancialComparisonPitchPosition,
	FinancialComparisonReport,
	FinancialComparisonRuntimeBasis,
	FinancialComparisonWinner,
	FinancialJobResponse,
	FinancialJobStatus,
	FinancialQuantumExecution,
	PortfolioAssetMetrics,
	PortfolioBenchmarkSummary,
	PortfolioCircuitSummary,
	PortfolioDatasetSummary,
	PortfolioFrontierSummary,
	PortfolioHamiltonianSummary,
	PortfolioQaoaParameters,
	PortfolioQuantumState,
	PortfolioRequestSummary,
	PortfolioSolverDiagnostics
} from '@/types/financial';
import type { BackendFinancialJobListItem } from '@/types/runs';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
	return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown) {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNumberArray(value: unknown) {
	return Array.isArray(value)
		? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
		: [];
}

function asStringArray(value: unknown) {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asObjectArray(value: unknown) {
	return Array.isArray(value) ? value.filter(isRecord) : [];
}

function normalizeIsoDate(value: unknown, fallback: string) {
	return asString(value)?.trim() || fallback;
}

const FINANCIAL_STATUS_MAP: Record<string, FinancialJobStatus> = {
	queued: 'QUEUED',
	ingesting: 'INGESTING',
	analyzing: 'ANALYSING',
	analysing: 'ANALYSING',
	completed: 'COMPLETED',
	failed: 'FAILED'
};

export function normalizeFinancialJobStatus(value: unknown): FinancialJobStatus {
	const normalized = asString(value)?.trim().toLowerCase() ?? '';
	return FINANCIAL_STATUS_MAP[normalized] ?? 'QUEUED';
}

function normalizePortfolioDatasetSummary(
	value: unknown,
	{
		rowCount,
		colCount
	}: {
		rowCount: number;
		colCount: number;
	}
): PortfolioDatasetSummary {
	const record = isRecord(value) ? value : {};
	return {
		input_layout: asString(record.input_layout) === 'wide' ? 'wide' : 'long',
		row_count: asNumber(record.row_count) ?? rowCount,
		col_count: asNumber(record.col_count) ?? colCount,
		period_count: asNumber(record.period_count) ?? 0,
		raw_asset_count: asNumber(record.raw_asset_count) ?? 0,
		asset_count: asNumber(record.asset_count) ?? 0,
		start_date: normalizeIsoDate(record.start_date, new Date(0).toISOString()),
		end_date: normalizeIsoDate(record.end_date, new Date(0).toISOString()),
		inferred_frequency:
			asString(record.inferred_frequency) === 'daily' ||
			asString(record.inferred_frequency) === 'weekly' ||
			asString(record.inferred_frequency) === 'monthly' ||
			asString(record.inferred_frequency) === 'quarterly' ||
			asString(record.inferred_frequency) === 'yearly'
				? (record.inferred_frequency as PortfolioDatasetSummary['inferred_frequency'])
				: 'unknown',
		return_method: asString(record.return_method) === 'provided_returns' ? 'provided_returns' : 'simple_returns',
		date_column: asString(record.date_column) ?? 'date',
		ticker_column: asString(record.ticker_column),
		value_column: asString(record.value_column),
		dropped_records: asNumber(record.dropped_records) ?? 0,
		selected_tickers: asStringArray(record.selected_tickers)
	};
}

function normalizePortfolioRequestSummary(value: unknown): PortfolioRequestSummary {
	const record = isRecord(value) ? value : {};
	const valueMode =
		asString(record.value_mode) === 'prices' || asString(record.value_mode) === 'returns'
			? (record.value_mode as PortfolioRequestSummary['value_mode'])
			: 'auto';
	const resolvedValueMode = asString(record.resolved_value_mode) === 'returns' ? 'returns' : 'prices';

	return {
		problem_type: 'portfolio_optimization',
		budget: asNumber(record.budget) ?? 0,
		risk_aversion: asNumber(record.risk_aversion) ?? 0,
		penalty: asNumber(record.penalty) ?? 0,
		max_assets_considered: asNumber(record.max_assets_considered) ?? 0,
		value_mode: valueMode,
		resolved_value_mode: resolvedValueMode,
		qaoa_reps: asNumber(record.qaoa_reps) ?? 1,
		parameter_search_steps: asNumber(record.parameter_search_steps) ?? 0,
		date_column: asString(record.date_column),
		ticker_column: asString(record.ticker_column),
		value_column: asString(record.value_column)
	};
}

function normalizePortfolioAssetMetrics(value: UnknownRecord): PortfolioAssetMetrics {
	return {
		ticker: asString(value.ticker) ?? 'UNKNOWN',
		periods: asNumber(value.periods) ?? 0,
		mean_return: asNumber(value.mean_return) ?? 0,
		annualized_return: asNumber(value.annualized_return) ?? 0,
		annualized_variance: asNumber(value.annualized_variance) ?? 0,
		annualized_volatility: asNumber(value.annualized_volatility) ?? 0,
		sharpe_like: asNumber(value.sharpe_like) ?? 0,
		selected_classical: value.selected_classical === true,
		selected_quantum: value.selected_quantum === true,
		selection_probability: asNumber(value.selection_probability) ?? 0
	};
}

function normalizePortfolioSelectionSummary(value: unknown): PortfolioQuantumState {
	const record = isRecord(value) ? value : {};
	return {
		bitstring: asString(record.bitstring) ?? '',
		selected_assets: asStringArray(record.selected_assets),
		selected_asset_count: asNumber(record.selected_asset_count) ?? 0,
		feasible: record.feasible === true,
		budget_gap: asNumber(record.budget_gap) ?? 0,
		objective: asNumber(record.objective) ?? 0,
		expected_return: asNumber(record.expected_return) ?? 0,
		variance: asNumber(record.variance) ?? 0,
		volatility: asNumber(record.volatility) ?? 0,
		probability: asNumber(record.probability),
		rank: asNumber(record.rank) ?? undefined
	};
}

function normalizePortfolioFrontierSummary(value: unknown): PortfolioFrontierSummary {
	const record = isRecord(value) ? value : {};
	return {
		feasible_portfolio_count: asNumber(record.feasible_portfolio_count) ?? 0,
		efficient_frontier: asObjectArray(record.efficient_frontier).map(normalizePortfolioSelectionSummary),
		quantum_rank: asNumber(record.quantum_rank),
		quantum_percentile: asNumber(record.quantum_percentile),
		quantum_on_frontier: record.quantum_on_frontier === true
	};
}

function normalizePortfolioSolverDiagnostics(value: unknown): PortfolioSolverDiagnostics {
	const record = isRecord(value) ? value : {};
	const classicalSolver = isRecord(record.classical_solver) ? record.classical_solver : {};
	const quantumSolver = isRecord(record.quantum_solver) ? record.quantum_solver : {};

	return {
		allocation_model: asString(record.allocation_model) ?? 'equal_weight_binary_selection',
		screened_asset_count: asNumber(record.screened_asset_count) ?? 0,
		budget: asNumber(record.budget) ?? 0,
		total_binary_states: asNumber(record.total_binary_states) ?? 0,
		feasible_portfolio_count: asNumber(record.feasible_portfolio_count) ?? 0,
		classical_solver: {
			strategy: asString(classicalSolver.strategy) ?? 'unknown',
			evaluated_portfolios: asNumber(classicalSolver.evaluated_portfolios) ?? 0
		},
		quantum_solver: {
			ansatz: asString(quantumSolver.ansatz) ?? 'QAOA',
			reps: asNumber(quantumSolver.reps) ?? 0,
			strategy: asString(quantumSolver.strategy) ?? 'unknown',
			parameter_evaluations: asNumber(quantumSolver.parameter_evaluations) ?? 0,
			backend: asString(quantumSolver.backend) ?? undefined,
			constraint_preserving:
				typeof quantumSolver.constraint_preserving === 'boolean'
					? quantumSolver.constraint_preserving
					: undefined,
			mixer: asString(quantumSolver.mixer) ?? undefined,
			initial_state: asString(quantumSolver.initial_state) ?? undefined,
			top_seed_count: asNumber(quantumSolver.top_seed_count) ?? undefined,
			candidate_count: asNumber(quantumSolver.candidate_count) ?? undefined,
			coarse_grid_steps: asNumber(quantumSolver.coarse_grid_steps) ?? 0,
			local_refinement_rounds: asNumber(quantumSolver.local_refinement_rounds) ?? 0,
			local_refinement_points: asNumber(quantumSolver.local_refinement_points) ?? 0
		}
	};
}

function normalizePortfolioBenchmarkSummary(value: unknown): PortfolioBenchmarkSummary {
	const record = isRecord(value) ? value : {};
	const comparison = isRecord(record.comparison) ? record.comparison : {};
	const timings = isRecord(record.timings) ? record.timings : {};

	return {
		objective_label: asString(record.objective_label) ?? 'objective',
		allocation_model: asString(record.allocation_model) ?? undefined,
		classical: normalizePortfolioSelectionSummary(record.classical),
		quantum: normalizePortfolioSelectionSummary(record.quantum),
		comparison: {
			objective_gap: asNumber(comparison.objective_gap) ?? 0,
			objective_ratio: asNumber(comparison.objective_ratio),
			return_gap: asNumber(comparison.return_gap) ?? 0,
			variance_gap: asNumber(comparison.variance_gap) ?? 0,
			overlap_count: asNumber(comparison.overlap_count) ?? 0,
			overlap_ratio: asNumber(comparison.overlap_ratio) ?? 0,
			feasible_probability_mass: asNumber(comparison.feasible_probability_mass) ?? 0,
			optimum_probability: asNumber(comparison.optimum_probability),
			quantum_advantage_detected: comparison.quantum_advantage_detected === true
		},
		frontier: normalizePortfolioFrontierSummary(record.frontier),
		timings: {
			shared_preparation_duration_ms: asNumber(timings.shared_preparation_duration_ms) ?? undefined,
			classical_duration_ms: asNumber(timings.classical_duration_ms) ?? 0,
			classical_solve_duration_ms: asNumber(timings.classical_solve_duration_ms) ?? undefined,
			classical_end_to_end_duration_ms:
				asNumber(timings.classical_end_to_end_duration_ms) ?? undefined,
			quantum_duration_ms: asNumber(timings.quantum_duration_ms) ?? 0,
			quantum_solve_duration_ms: asNumber(timings.quantum_solve_duration_ms) ?? undefined,
			quantum_parameter_search_duration_ms:
				asNumber(timings.quantum_parameter_search_duration_ms) ?? undefined,
			quantum_solution_extraction_duration_ms:
				asNumber(timings.quantum_solution_extraction_duration_ms) ?? undefined,
			quantum_circuit_compile_duration_ms:
				asNumber(timings.quantum_circuit_compile_duration_ms) ?? undefined,
			quantum_local_end_to_end_duration_ms:
				asNumber(timings.quantum_local_end_to_end_duration_ms) ?? undefined,
			quantum_end_to_end_duration_ms: asNumber(timings.quantum_end_to_end_duration_ms) ?? undefined,
			service_wait_duration_ms: asNumber(timings.service_wait_duration_ms) ?? undefined,
			plan_compile_duration_ms: asNumber(timings.plan_compile_duration_ms) ?? undefined,
			distributed_execution_duration_ms:
				asNumber(timings.distributed_execution_duration_ms) ?? undefined,
			report_assembly_duration_ms: asNumber(timings.report_assembly_duration_ms) ?? undefined,
			workflow_total_duration_ms: asNumber(timings.workflow_total_duration_ms) ?? undefined
		}
	};
}

function normalizeFinancialComparisonWinner(value: unknown): FinancialComparisonWinner {
	const raw = asString(value);
	if (raw === 'classical' || raw === 'quantum' || raw === 'tie' || raw === 'inconclusive') {
		return raw;
	}
	return 'inconclusive';
}

function normalizeFinancialComparisonPitchPosition(value: unknown): FinancialComparisonPitchPosition {
	const raw = asString(value);
	if (raw === 'workflow_evidence' || raw === 'mixed' || raw === 'numerical_advantage' || raw === 'not_ready') {
		return raw;
	}
	return 'not_ready';
}

function normalizeFinancialComparisonClaimReadiness(value: unknown): FinancialComparisonClaimReadiness {
	const raw = asString(value);
	if (raw === 'ready' || raw === 'qualified' || raw === 'not_ready') {
		return raw;
	}
	return 'not_ready';
}

function normalizeFinancialComparisonRuntimeBasis(value: unknown): FinancialComparisonRuntimeBasis {
	const raw = asString(value);
	if (raw === 'solver_only' || raw === 'end_to_end_paths' || raw === 'inconclusive') {
		return raw;
	}
	return 'inconclusive';
}

export function normalizeFinancialComparisonReport(value: unknown): FinancialComparisonReport | undefined {
	if (!isRecord(value)) {
		return undefined;
	}

	const fairness = isRecord(value.fairness) ? value.fairness : {};
	const dataset = isRecord(value.dataset) ? value.dataset : {};
	const problem = isRecord(value.problem) ? value.problem : {};
	const classical = isRecord(value.classical) ? value.classical : {};
	const quantum = isRecord(value.quantum) ? value.quantum : {};
	const scorecard = isRecord(value.scorecard) ? value.scorecard : {};
	const evidence = isRecord(value.evidence) ? value.evidence : {};
	const verdict = isRecord(value.verdict) ? value.verdict : {};
	const datasetRowCount = asNumber(dataset.row_count) ?? 0;
	const datasetColCount = asNumber(dataset.col_count) ?? 0;

	return {
		job_id: asString(value.job_id) ?? 'fin-unknown',
		filename: asString(value.filename) ?? 'financial.csv',
		generated_at: normalizeIsoDate(value.generated_at, new Date(0).toISOString()),
		fairness: {
			same_dataset: fairness.same_dataset === true,
			same_constraints: fairness.same_constraints === true,
			same_objective: fairness.same_objective === true,
			notes: asStringArray(fairness.notes)
		},
		dataset: {
			input_layout: asString(dataset.input_layout) === 'wide' ? 'wide' : 'long',
			inferred_frequency:
				asString(dataset.inferred_frequency) === 'daily' ||
				asString(dataset.inferred_frequency) === 'weekly' ||
				asString(dataset.inferred_frequency) === 'monthly' ||
				asString(dataset.inferred_frequency) === 'quarterly' ||
				asString(dataset.inferred_frequency) === 'yearly'
					? (dataset.inferred_frequency as PortfolioDatasetSummary['inferred_frequency'])
					: 'unknown',
			row_count: datasetRowCount,
			col_count: datasetColCount,
			period_count: asNumber(dataset.period_count) ?? 0,
			asset_count: asNumber(dataset.asset_count) ?? 0,
			raw_asset_count: asNumber(dataset.raw_asset_count) ?? 0,
			start_date: normalizeIsoDate(dataset.start_date, new Date(0).toISOString()),
			end_date: normalizeIsoDate(dataset.end_date, new Date(0).toISOString()),
			selected_tickers: asStringArray(dataset.selected_tickers)
		},
		problem: {
			problem_type: 'portfolio_optimization',
			objective_label: asString(problem.objective_label) ?? 'objective',
			allocation_model: asString(problem.allocation_model) ?? 'unknown',
			budget: asNumber(problem.budget) ?? 0,
			risk_aversion: asNumber(problem.risk_aversion) ?? 0,
			penalty: asNumber(problem.penalty) ?? 0,
			qaoa_reps: asNumber(problem.qaoa_reps) ?? 1,
			parameter_search_steps: asNumber(problem.parameter_search_steps) ?? 0,
			classical_strategy: asString(problem.classical_strategy) ?? 'unknown',
			quantum_strategy: asString(problem.quantum_strategy) ?? 'unknown'
		},
		classical: {
			...normalizePortfolioSelectionSummary(classical),
			duration_ms: asNumber(classical.duration_ms) ?? 0,
			solve_duration_ms: asNumber(classical.solve_duration_ms) ?? undefined,
			end_to_end_duration_ms: asNumber(classical.end_to_end_duration_ms) ?? undefined,
			shared_preparation_duration_ms:
				asNumber(classical.shared_preparation_duration_ms) ?? undefined,
			strategy: asString(classical.strategy) ?? 'unknown',
			evaluated_portfolios: asNumber(classical.evaluated_portfolios) ?? 0,
			is_exact_optimum: classical.is_exact_optimum === true
		},
		quantum: {
			...normalizePortfolioSelectionSummary(quantum),
			duration_ms: asNumber(quantum.duration_ms) ?? 0,
			solve_duration_ms: asNumber(quantum.solve_duration_ms) ?? undefined,
			end_to_end_duration_ms: asNumber(quantum.end_to_end_duration_ms) ?? undefined,
			local_end_to_end_duration_ms: asNumber(quantum.local_end_to_end_duration_ms) ?? undefined,
			parameter_search_duration_ms:
				asNumber(quantum.parameter_search_duration_ms) ?? undefined,
			solution_extraction_duration_ms:
				asNumber(quantum.solution_extraction_duration_ms) ?? undefined,
			circuit_compile_duration_ms: asNumber(quantum.circuit_compile_duration_ms) ?? undefined,
			service_wait_duration_ms: asNumber(quantum.service_wait_duration_ms) ?? undefined,
			plan_compile_duration_ms: asNumber(quantum.plan_compile_duration_ms) ?? undefined,
			distributed_execution_duration_ms:
				asNumber(quantum.distributed_execution_duration_ms) ?? undefined,
			strategy: asString(quantum.strategy) ?? 'unknown',
			ansatz: asString(quantum.ansatz) ?? 'QAOA',
			parameter_evaluations: asNumber(quantum.parameter_evaluations) ?? 0,
			feasible_probability_mass: asNumber(quantum.feasible_probability_mass) ?? 0,
			optimum_probability: asNumber(quantum.optimum_probability),
			percentile: asNumber(quantum.percentile),
			on_frontier: quantum.on_frontier === true,
			plan_id: asString(quantum.plan_id),
			fragments_executed: asNumber(quantum.fragments_executed) ?? 0,
			distributed_nodes_used: asNumber(quantum.distributed_nodes_used) ?? 0,
			circuit_qubits: asNumber(quantum.circuit_qubits),
			circuit_depth: asNumber(quantum.circuit_depth),
			circuit_size: asNumber(quantum.circuit_size),
			has_qasm: quantum.has_qasm === true,
			has_runtime_result: quantum.has_runtime_result === true
		},
		scorecard: {
			winner_by_objective: normalizeFinancialComparisonWinner(scorecard.winner_by_objective),
			winner_by_return: normalizeFinancialComparisonWinner(scorecard.winner_by_return),
			winner_by_risk: normalizeFinancialComparisonWinner(scorecard.winner_by_risk),
			winner_by_runtime: normalizeFinancialComparisonWinner(scorecard.winner_by_runtime),
			winner_by_solver_runtime: normalizeFinancialComparisonWinner(scorecard.winner_by_solver_runtime),
			runtime_basis: normalizeFinancialComparisonRuntimeBasis(scorecard.runtime_basis),
			objective_gap: asNumber(scorecard.objective_gap) ?? 0,
			objective_ratio: asNumber(scorecard.objective_ratio),
			return_gap: asNumber(scorecard.return_gap) ?? 0,
			variance_gap: asNumber(scorecard.variance_gap) ?? 0,
			overlap_count: asNumber(scorecard.overlap_count) ?? 0,
			overlap_ratio: asNumber(scorecard.overlap_ratio) ?? 0,
			quantum_advantage_detected: scorecard.quantum_advantage_detected === true
		},
		evidence: {
			exact_baseline_available: evidence.exact_baseline_available === true,
			efficient_frontier_points: asNumber(evidence.efficient_frontier_points) ?? 0,
			top_state_count: asNumber(evidence.top_state_count) ?? 0,
			fragment_count: asNumber(evidence.fragment_count) ?? 0,
			observed_basis_state_count: asNumber(evidence.observed_basis_state_count) ?? 0,
			workflow_total_duration_ms: asNumber(evidence.workflow_total_duration_ms) ?? undefined,
			runtime_basis: normalizeFinancialComparisonRuntimeBasis(evidence.runtime_basis),
			warnings: asStringArray(evidence.warnings)
		},
		verdict: {
			pitch_position: normalizeFinancialComparisonPitchPosition(verdict.pitch_position),
			claim_readiness: normalizeFinancialComparisonClaimReadiness(verdict.claim_readiness),
			headline: asString(verdict.headline) ?? 'Comparison unavailable.',
			summary: asString(verdict.summary) ?? 'Comparison unavailable.',
			strengths: asStringArray(verdict.strengths),
			limitations: asStringArray(verdict.limitations),
			recommended_claims: asStringArray(verdict.recommended_claims),
			avoid_claims: asStringArray(verdict.avoid_claims)
		}
	};
}

function normalizePortfolioQaoaParameters(value: unknown): PortfolioQaoaParameters | undefined {
	if (!isRecord(value)) {
		return undefined;
	}

	return {
		reps: asNumber(value.reps) ?? 1,
		beta: asNumber(value.beta) ?? 0,
		gamma: asNumber(value.gamma) ?? 0,
		beta_parameters: asNumberArray(value.beta_parameters),
		gamma_parameters: asNumberArray(value.gamma_parameters),
		parameter_search_steps: asNumber(value.parameter_search_steps) ?? 0,
		search_strategy: asString(value.search_strategy) ?? undefined,
		mixer_strategy: asString(value.mixer_strategy) ?? undefined,
		initial_state_strategy: asString(value.initial_state_strategy) ?? undefined,
		warm_start_bitstring: asString(value.warm_start_bitstring) ?? undefined
	};
}

function normalizePortfolioCircuitSummary(value: unknown): PortfolioCircuitSummary | undefined {
	if (!isRecord(value)) {
		return undefined;
	}

	const gateCounts = isRecord(value.gate_counts)
		? Object.entries(value.gate_counts).reduce<Record<string, number>>((acc, [name, count]) => {
				if (typeof count === 'number' && Number.isFinite(count)) {
					acc[name] = count;
				}
				return acc;
			}, {})
		: {};

	return {
		qubit_count: asNumber(value.qubit_count) ?? 0,
		depth: asNumber(value.depth) ?? 0,
		size: asNumber(value.size) ?? 0,
		parameter_count: asNumber(value.parameter_count) ?? 0,
		gate_counts: gateCounts
	};
}

function normalizePortfolioHamiltonianSummary(value: unknown): PortfolioHamiltonianSummary | undefined {
	if (!isRecord(value)) {
		return undefined;
	}

	return {
		offset: asNumber(value.offset) ?? 0,
		linear_fields: asObjectArray(value.linear_fields).map(item => ({
			asset: asNumber(item.asset) ?? 0,
			coefficient: asNumber(item.coefficient) ?? 0
		})),
		couplings: asObjectArray(value.couplings).map(item => ({
			asset_i: asNumber(item.asset_i) ?? 0,
			asset_j: asNumber(item.asset_j) ?? 0,
			coefficient: asNumber(item.coefficient) ?? 0
		})),
		penalty_strategy: asString(value.penalty_strategy) ?? 'unknown'
	};
}

function normalizeFinancialQuantumExecution(value: unknown): FinancialQuantumExecution | null {
	if (!isRecord(value)) {
		return null;
	}

	return {
		circuit_text: asString(value.circuit_text) ?? '',
		encoded_assets: asStringArray(value.encoded_assets),
		encoded_columns: asStringArray(value.encoded_columns),
		qaoa_parameters: normalizePortfolioQaoaParameters(value.qaoa_parameters),
		circuit_summary: normalizePortfolioCircuitSummary(value.circuit_summary),
		top_states: asObjectArray(value.top_states).map(normalizePortfolioSelectionSummary),
		hamiltonian: normalizePortfolioHamiltonianSummary(value.hamiltonian),
		feature_mapping: [],
		plan: (isRecord(value.plan)
			? value.plan
			: {
					plan_id: '',
					fragment_order: [],
					fragments: {},
					assignments: {},
					stages: [],
					blocks: {},
					quality_snapshot_id: null
				}) as BackendPlanResponse,
		fragment_results: (Array.isArray(value.fragment_results)
			? value.fragment_results
			: []) as BackendJobFragmentResult[],
		quantum_result: (isRecord(value.quantum_result) ? value.quantum_result : null) as BackendJobQuantumResult | null
	};
}

export function normalizeFinancialAnalysisResult(
	value: unknown,
	{
		jobId,
		filename,
		generatedAt
	}: {
		jobId: string;
		filename: string;
		generatedAt: string;
	}
): FinancialAnalysisResult | undefined {
	if (!isRecord(value)) {
		return undefined;
	}

	const rowCount = asNumber(value.row_count) ?? 0;
	const colCount = asNumber(value.col_count) ?? 0;

	return {
		job_id: asString(value.job_id) ?? jobId,
		filename: asString(value.filename) ?? filename,
		problem_type: 'portfolio_optimization',
		summary: asString(value.summary) ?? 'Portfolio optimization analysis completed.',
		row_count: rowCount,
		col_count: colCount,
		dataset: normalizePortfolioDatasetSummary(value.dataset, { rowCount, colCount }),
		request: normalizePortfolioRequestSummary(value.request),
		asset_universe: asObjectArray(value.asset_universe).map(normalizePortfolioAssetMetrics),
		benchmark: normalizePortfolioBenchmarkSummary(value.benchmark),
		comparison_report: normalizeFinancialComparisonReport(value.comparison_report),
		solver_diagnostics: normalizePortfolioSolverDiagnostics(value.solver_diagnostics),
		warnings: asStringArray(value.warnings),
		quantum_execution: normalizeFinancialQuantumExecution(value.quantum_execution),
		analysis_duration_ms: asNumber(value.analysis_duration_ms) ?? 0,
		distributed_nodes_used: asNumber(value.distributed_nodes_used) ?? 0,
		fragments_executed: asNumber(value.fragments_executed) ?? 0,
		generated_at: normalizeIsoDate(value.generated_at, generatedAt),
		numeric_columns: [],
		categorical_columns: [],
		datetime_columns: [],
		column_profiles: [],
		correlations: [],
		top_correlations: [],
		time_series_insights: [],
		anomalies: [],
		summary_stats: {},
		node_execution: []
	};
}

export function normalizeFinancialJobListItem(value: unknown): BackendFinancialJobListItem | null {
	if (!isRecord(value)) {
		return null;
	}

	const createdAt = normalizeIsoDate(value.created_at, new Date(0).toISOString());
	const updatedAt = normalizeIsoDate(value.updated_at, createdAt);

	return {
		job_id: asString(value.job_id) ?? 'fin-unknown',
		problem_type: asString(value.problem_type) === 'portfolio_optimization' ? 'portfolio_optimization' : null,
		status: normalizeFinancialJobStatus(value.status),
		filename: asString(value.filename) ?? 'financial.csv',
		row_count: asNumber(value.row_count),
		col_count: asNumber(value.col_count),
		error: asString(value.error),
		created_at: createdAt,
		updated_at: updatedAt
	};
}

export function normalizeFinancialJobList(value: unknown) {
	return Array.isArray(value)
		? value.map(normalizeFinancialJobListItem).filter((item): item is BackendFinancialJobListItem => item !== null)
		: [];
}

export function normalizeFinancialJobResponse(value: unknown): FinancialJobResponse | null {
	if (!isRecord(value)) {
		return null;
	}

	const createdAt = normalizeIsoDate(value.created_at, new Date(0).toISOString());
	const updatedAt = normalizeIsoDate(value.updated_at, createdAt);
	const jobId = asString(value.job_id) ?? 'fin-unknown';
	const filename = asString(value.filename) ?? 'financial.csv';

	return {
		job_id: jobId,
		problem_type: asString(value.problem_type),
		status: normalizeFinancialJobStatus(value.status),
		filename,
		row_count: asNumber(value.row_count) ?? undefined,
		col_count: asNumber(value.col_count) ?? undefined,
		error: asString(value.error) ?? undefined,
		created_at: createdAt,
		updated_at: updatedAt,
		result: normalizeFinancialAnalysisResult(value.result, {
			jobId,
			filename,
			generatedAt: updatedAt
		})
	};
}
