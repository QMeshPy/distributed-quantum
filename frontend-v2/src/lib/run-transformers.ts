import type {
	BackendHealthResponse,
	BackendJobListItemResponse,
	BackendJobProgressResponse,
	BackendJobQuantumResult,
	BackendJobStatusResponse,
	BackendPlanResponse
} from '@/types/backend';
import {
	getRunBadgeVariant,
	getRunBadgeVariantFinancial,
	getRunStatusGroup,
	getRunStatusGroupFinancial,
	getRunStatusLabel,
	getRunStatusLabelFinancial
} from '@/lib/run-status';
import type { FinancialAnalysisResult, FinancialJobResponse } from '@/types/financial';
import type {
	BackendFinancialJobListItem,
	FinancialJobStatus,
	RunDetailSnapshot,
	RunFragmentResultSummary,
	RunHealthSummary,
	RunMeasurementBucket,
	RunPlanCandidateSummary,
	RunPlanFragmentSummary,
	RunPlanSummary,
	RunProgressSummary,
	RunQuantumSummary,
	RunSummary,
	RunsCountSummary,
	RunsListSnapshot
} from '@/types/runs';

type BuildRunsListSnapshotInput = {
	generatedAt: string;
	health: BackendHealthResponse | null;
	jobs: BackendJobListItemResponse[];
	warnings?: string[];
	jobsListUnavailable?: boolean;
	/** Financial CSV analysis jobs (merged into run history). */
	financialJobs?: BackendFinancialJobListItem[];
	/** Real options pricing jobs (merged into run history). */
	optionsJobs?: BackendOptionsJobListItem[];
};

type BuildRunDetailSnapshotInput = {
	generatedAt: string;
	health: BackendHealthResponse | null;
	job: BackendJobStatusResponse;
	plan: BackendPlanResponse | null;
	warnings?: string[];
};

type BuildFinancialRunDetailSnapshotInput = {
	generatedAt: string;
	health: BackendHealthResponse | null;
	job: FinancialJobResponse;
	warnings?: string[];
};

function formatAbsoluteDateTime(isoValue: string) {
	const date = new Date(isoValue);

	if (Number.isNaN(date.getTime())) {
		return 'Unknown';
	}

	return new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(date);
}

function formatRelativeTime(isoValue: string | null, referenceDate: Date) {
	if (!isoValue) {
		return 'Unavailable';
	}

	const date = new Date(isoValue);

	if (Number.isNaN(date.getTime())) {
		return 'Unavailable';
	}

	const diffMs = referenceDate.getTime() - date.getTime();
	const absDiffMs = Math.abs(diffMs);
	const suffix = diffMs >= 0 ? 'ago' : 'from now';

	if (absDiffMs < 60_000) {
		return 'just now';
	}

	if (absDiffMs < 3_600_000) {
		return `${Math.round(absDiffMs / 60_000)}m ${suffix}`;
	}

	if (absDiffMs < 86_400_000) {
		return `${Math.round(absDiffMs / 3_600_000)}h ${suffix}`;
	}

	return `${Math.round(absDiffMs / 86_400_000)}d ${suffix}`;
}

function formatUptime(seconds: number) {
	if (seconds < 60) {
		return `${Math.max(0, Math.floor(seconds))}s`;
	}

	if (seconds < 3_600) {
		return `${Math.floor(seconds / 60)}m`;
	}

	if (seconds < 86_400) {
		return `${Math.floor(seconds / 3_600)}h ${Math.floor((seconds % 3_600) / 60)}m`;
	}

	return `${Math.floor(seconds / 86_400)}d ${Math.floor((seconds % 86_400) / 3_600)}h`;
}

function sortMeasurementBuckets(source: Record<string, number> | null | undefined): RunMeasurementBucket[] {
	return Object.entries(source ?? {})
		.sort((left, right) => right[1] - left[1])
		.map(([key, value]) => ({
			key,
			value
		}));
}

function toRunHealthSummary(health: BackendHealthResponse | null): RunHealthSummary | null {
	if (!health) {
		return null;
	}

	return {
		status: health.status,
		service: health.service,
		version: health.version,
		environment: health.environment,
		uptimeLabel: formatUptime(health.uptime_seconds)
	};
}

function toRunProgressSummary(
	progress: BackendJobProgressResponse | null,
	referenceDate: Date
): RunProgressSummary | null {
	if (!progress) {
		return null;
	}

	return {
		totalFragments: progress.total_fragments,
		completedFragments: progress.completed_fragments,
		activeFragments: progress.active_fragments,
		completionRatio: progress.completion_ratio,
		completionPercentage: Math.round(progress.completion_ratio * 100),
		latestEventAt: progress.latest_event_at,
		latestEventLabel: formatRelativeTime(progress.latest_event_at, referenceDate),
		finalizing: progress.finalizing
	};
}

export function buildCircuitPreview(circuitText: string | null | undefined, maxLength = 96) {
	if (circuitText == null || circuitText === '') {
		return 'Circuit submitted';
	}

	let fallback: string | null = null;

	for (const line of circuitText.split('\n')) {
		const normalized = line.trim().replace(/\s+/g, ' ');

		if (!normalized) {
			continue;
		}

		const preview = normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}...`;

		if (!fallback) {
			fallback = preview;
		}

		const upperLine = normalized.toUpperCase();

		if (
			upperLine.startsWith('OPENQASM') ||
			upperLine.startsWith('INCLUDE ') ||
			upperLine.startsWith('QREG ') ||
			upperLine.startsWith('CREG ') ||
			upperLine.startsWith('QUBIT[') ||
			upperLine.startsWith('BIT[')
		) {
			continue;
		}

		return preview;
	}

	return fallback ?? 'Circuit submitted';
}

export function sortRunSummaries(runs: RunSummary[]) {
	return [...runs].sort((left, right) => {
		const updatedDelta = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();

		if (updatedDelta !== 0) {
			return updatedDelta;
		}

		return right.id.localeCompare(left.id);
	});
}

export function countRuns(runs: RunSummary[]): RunsCountSummary {
	return runs.reduce<RunsCountSummary>(
		(counts, run) => {
			counts.total += 1;
			counts[run.statusGroup] += 1;
			return counts;
		},
		{
			total: 0,
			queued: 0,
			running: 0,
			completed: 0,
			failed: 0
		}
	);
}

export function toRunSummaryFromListItem(job: BackendJobListItemResponse, referenceDate: Date): RunSummary {
	return {
		id: job.job_id,
		jobKind: 'circuit',
		backendStatus: job.status,
		statusLabel: getRunStatusLabel(job.status),
		statusGroup: getRunStatusGroup(job.status),
		badgeVariant: getRunBadgeVariant(job.status),
		circuitPreview: job.circuit_preview,
		planId: job.plan_id,
		error: job.error,
		resultAvailable: job.result_available,
		createdAt: job.created_at,
		createdAtLabel: formatAbsoluteDateTime(job.created_at),
		updatedAt: job.updated_at,
		updatedAtLabel: formatRelativeTime(job.updated_at, referenceDate),
		progress: toRunProgressSummary(job.progress, referenceDate)
	};
}

const FINANCIAL_FRAGMENTS_TOTAL = 4;

function financialProgressSynthetic(status: FinancialJobStatus): RunProgressSummary | null {
	let completedFragments = 0;
	let activeFragments = 0;
	switch (status) {
		case 'QUEUED':
			break;
		case 'INGESTING':
			completedFragments = 1;
			activeFragments = 1;
			break;
		case 'ANALYSING':
			completedFragments = 3;
			activeFragments = 1;
			break;
		case 'COMPLETED':
			completedFragments = FINANCIAL_FRAGMENTS_TOTAL;
			break;
		case 'FAILED':
			break;
		default:
			return null;
	}
	const completionRatio = completedFragments / FINANCIAL_FRAGMENTS_TOTAL;
	return {
		totalFragments: FINANCIAL_FRAGMENTS_TOTAL,
		completedFragments,
		activeFragments,
		completionRatio,
		completionPercentage: Math.round(completionRatio * 100),
		latestEventAt: null,
		latestEventLabel: '-',
		finalizing: status === 'ANALYSING'
	};
}

function formatFinancialPreview(filename: string, problemType?: string | null) {
	const label = problemType === 'portfolio_optimization' ? 'Portfolio optimization' : 'Financial job';
	return `${label} - ${filename}`;
}

/** Shape returned by GET /api/v1/options?limit=N */
export type BackendOptionsJobListItem = {
	job_id: string;
	option_type: string;
	status: string;
	error: string | null;
	created_at: string;
	updated_at: string;
};

const OPTION_TYPE_LABELS: Record<string, string> = {
	european_call_short: 'European Call (Short-term)',
	european_put_long: 'European Put (Long-term)',
	expand: 'Option to Expand',
	delay: 'Option to Delay',
	abandon: 'Option to Abandon',
	patent: 'Patent / R&D Option',
	natural_resource: 'Natural Resource Option',
	financial_flexibility: 'Financial Flexibility Option'
};

function optionsStatusToGroup(status: string): import('@/types/runs').RunStatusGroup {
	switch (status.toLowerCase()) {
		case 'queued':
			return 'queued';
		case 'running':
			return 'running';
		case 'completed':
			return 'completed';
		default:
			return 'failed';
	}
}

function optionsBadgeVariant(status: string): import('@/types/runs').RunBadgeVariant {
	switch (status.toLowerCase()) {
		case 'queued':
			return 'secondary';
		case 'running':
			return 'default';
		case 'completed':
			return 'outline';
		default:
			return 'destructive';
	}
}

function toRunSummaryFromOptionsListItem(row: BackendOptionsJobListItem, referenceDate: Date): RunSummary {
	const label = OPTION_TYPE_LABELS[row.option_type] ?? row.option_type;
	const statusLabel =
		row.status.charAt(0).toUpperCase() + row.status.slice(1).toLowerCase();
	return {
		id: row.job_id,
		jobKind: 'options',
		backendStatus: row.status as import('@/types/runs').RunListBackendStatus,
		statusLabel,
		statusGroup: optionsStatusToGroup(row.status),
		badgeVariant: optionsBadgeVariant(row.status),
		circuitPreview: `Real Options Pricing – ${label}`,
		planId: null,
		error: row.error,
		resultAvailable: row.status.toLowerCase() === 'completed',
		createdAt: row.created_at,
		createdAtLabel: formatAbsoluteDateTime(row.created_at),
		updatedAt: row.updated_at,
		updatedAtLabel: formatRelativeTime(row.updated_at, referenceDate),
		progress: null
	};
}

function toTrackBRunSummaryFromFinancialListItem(
	row: BackendFinancialJobListItem,
	referenceDate: Date
): RunSummary {
	const status = row.status;
	return {
		id: row.job_id,
		jobKind: 'financial',
		backendStatus: status,
		statusLabel: getRunStatusLabelFinancial(status),
		statusGroup: getRunStatusGroupFinancial(status),
		badgeVariant: getRunBadgeVariantFinancial(status),
		circuitPreview: formatFinancialPreview(row.filename, row.problem_type),
		planId: null,
		error: row.error,
		resultAvailable: status === 'COMPLETED',
		createdAt: row.created_at,
		createdAtLabel: formatAbsoluteDateTime(row.created_at),
		updatedAt: row.updated_at,
		updatedAtLabel: formatRelativeTime(row.updated_at, referenceDate),
		progress: financialProgressSynthetic(status)
	};
}

export function toRunSummaryFromDetail(job: BackendJobStatusResponse, referenceDate: Date): RunSummary {
	return {
		id: job.job_id,
		jobKind: 'circuit',
		backendStatus: job.status,
		statusLabel: getRunStatusLabel(job.status),
		statusGroup: getRunStatusGroup(job.status),
		badgeVariant: getRunBadgeVariant(job.status),
		circuitPreview: buildCircuitPreview(job.circuit_text),
		planId: job.plan_id,
		error: job.error,
		resultAvailable: job.result !== null,
		createdAt: job.created_at,
		createdAtLabel: formatAbsoluteDateTime(job.created_at),
		updatedAt: job.updated_at,
		updatedAtLabel: formatRelativeTime(job.updated_at, referenceDate),
		progress: toRunProgressSummary(job.progress, referenceDate)
	};
}

function buildQuantumSummary(quantumResult: BackendJobQuantumResult | null): RunQuantumSummary | null {
	if (!quantumResult) {
		return null;
	}

	return {
		shots: quantumResult.shots ?? null,
		measuredQubits: quantumResult.measured_qubits ?? [],
		countBuckets: sortMeasurementBuckets(quantumResult.counts),
		measuredProbabilities: sortMeasurementBuckets(quantumResult.measured_probabilities),
		observableExpectations: sortMeasurementBuckets(quantumResult.observable_expectations),
		entanglementEntropy: sortMeasurementBuckets(quantumResult.entanglement_entropy),
		blochVectors: quantumResult.bloch_vectors ?? null,
		fidelity: quantumResult.fidelity ?? null,
		topBasisStates: quantumResult.top_basis_states ?? [],
		statevector: quantumResult.statevector ?? null,
		reducedDensityMatrices: quantumResult.reduced_density_matrices ?? null
	};
}

function buildPlanSummary(plan: BackendPlanResponse | null): RunPlanSummary | null {
	if (!plan) {
		return null;
	}

	const fragments: RunPlanFragmentSummary[] = plan.fragment_order.map(fragmentId => {
		const fragment = plan.fragments[fragmentId];
		const assignment = plan.assignments[fragmentId];
		const qubits = fragment?.qubits ?? [];
		const dependencies = fragment?.dependencies ?? [];
		const operationIds = fragment?.operation_ids ?? [];
		const candidates: RunPlanCandidateSummary[] = (assignment?.candidates ?? []).map(candidate => ({
			nodeId: candidate.node_id,
			totalCost: candidate.total_cost,
			latencyCost: candidate.latency_cost,
			failureRiskCost: candidate.failure_risk_cost,
			loadCost: candidate.load_cost,
			fidelity: candidate.fidelity
		}));

		return {
			fragmentId,
			serviceType: fragment?.service_type ?? 'unknown',
			qubits,
			qubitsLabel: qubits.length ? qubits.join(', ') : 'None',
			operationIds,
			dependencies,
			operationCount: operationIds.length,
			dependencyCount: dependencies.length,
			primaryNodeId: assignment?.primary_node_id ?? null,
			fallbackNodeIds: assignment?.fallback_node_ids ?? [],
			candidateCount: candidates.length,
			candidates
		};
	});

	return {
		planId: plan.plan_id,
		qualitySnapshotId: plan.quality_snapshot_id,
		fragmentOrder: plan.fragment_order,
		fragments
	};
}

function mapFragmentResults(
	fragmentResults: Array<{
		fragment_id: string;
		node_id: string;
		status: string;
		attempts: number;
		observed_fidelity?: number | null;
		started_at?: string | null;
		finished_at?: string | null;
		error?: string | null;
	}>,
	referenceDate: Date
): RunFragmentResultSummary[] {
	return fragmentResults.map(fragment => ({
		fragmentId: fragment.fragment_id,
		nodeId: fragment.node_id,
		status: fragment.status,
		attempts: fragment.attempts,
		observedFidelityRatio: typeof fragment.observed_fidelity === 'number' ? fragment.observed_fidelity : null,
		observedFidelity:
			typeof fragment.observed_fidelity === 'number' ? `${(fragment.observed_fidelity * 100).toFixed(2)}%` : null,
		startedAt: fragment.started_at ?? null,
		startedAtLabel: formatRelativeTime(fragment.started_at ?? null, referenceDate),
		finishedAt: fragment.finished_at ?? null,
		finishedAtLabel: formatRelativeTime(fragment.finished_at ?? null, referenceDate),
		error: fragment.error ?? null
	}));
}

export function buildRunsListSnapshot({
	generatedAt,
	health,
	jobs,
	warnings = [],
	jobsListUnavailable = false,
	financialJobs = [],
	optionsJobs = []
}: BuildRunsListSnapshotInput): RunsListSnapshot {
	const referenceDate = new Date(generatedAt);
	const circuitRuns = jobs.map(job => toRunSummaryFromListItem(job, referenceDate));
	const financialRuns = financialJobs.map(row => toTrackBRunSummaryFromFinancialListItem(row, referenceDate));
	const optionsRuns = optionsJobs.map(row => toRunSummaryFromOptionsListItem(row, referenceDate));
	const runs = sortRunSummaries([...circuitRuns, ...financialRuns, ...optionsRuns]);

	return {
		generatedAt,
		warnings,
		...(jobsListUnavailable ? { jobsListUnavailable: true } : {}),
		health: toRunHealthSummary(health),
		counts: countRuns(runs),
		runs
	};
}

function toRunSummaryFromFinancialJob(job: FinancialJobResponse, referenceDate: Date): RunSummary {
	const row: BackendFinancialJobListItem = {
		job_id: job.job_id,
		problem_type:
			job.problem_type === 'portfolio_optimization' || job.result?.problem_type === 'portfolio_optimization'
				? 'portfolio_optimization'
				: null,
		status: job.status,
		filename: job.filename,
		row_count: job.row_count ?? null,
		col_count: job.col_count ?? null,
		error: job.error ?? null,
		created_at: job.created_at,
		updated_at: job.updated_at
	};
	return toTrackBRunSummaryFromFinancialListItem(row, referenceDate);
}

type TrackBFinancialFallbackStage = {
	fragmentId: string;
	serviceType: string;
	operationId: string;
};

function getTrackBFinancialFallbackStages(jobId: string): TrackBFinancialFallbackStage[] {
	return [
		{
			fragmentId: `${jobId}-ingest`,
			serviceType: 'portfolio_ingestion',
			operationId: 'parse_csv'
		},
		{
			fragmentId: `${jobId}-screen`,
			serviceType: 'asset_screening',
			operationId: 'screen_assets'
		},
		{
			fragmentId: `${jobId}-classical`,
			serviceType: 'classical_baseline',
			operationId: 'solve_classically'
		},
		{
			fragmentId: `${jobId}-quantum`,
			serviceType: 'quantum_portfolio',
			operationId: 'solve_quantum'
		}
	];
}

function buildTrackBFinancialPlanFromResult(result: FinancialAnalysisResult, jobId: string): RunPlanSummary {
	const stages = getTrackBFinancialFallbackStages(jobId);
	const fragmentOrder = stages.map(stage => stage.fragmentId);
	const primaryNodeId = result.distributed_nodes_used > 1 ? 'distributed-runtime' : 'finance-coordinator';

	return {
		planId: jobId,
		qualitySnapshotId: null,
		fragmentOrder,
		fragments: stages.map((stage, index) => {
			const dependencies = index === 0 ? [] : [stages[index - 1].fragmentId];
			const candidate: RunPlanCandidateSummary = {
				nodeId: primaryNodeId,
				totalCost: index + 1,
				latencyCost: index + 1,
				failureRiskCost: 0.05,
				loadCost: result.row_count,
				fidelity: 0.95
			};

			return {
				fragmentId: stage.fragmentId,
				serviceType: stage.serviceType,
				qubits: [],
				qubitsLabel: 'None',
				operationIds: [stage.operationId],
				dependencies,
				operationCount: 1,
				dependencyCount: dependencies.length,
				primaryNodeId,
				fallbackNodeIds: [],
				candidateCount: 1,
				candidates: [candidate]
			};
		})
	};
}

function buildTrackBFinancialFragmentResults(
	jobId: string,
	result: FinancialAnalysisResult,
	referenceDate: Date
): RunFragmentResultSummary[] {
	const stages = getTrackBFinancialFallbackStages(jobId);
	const fallbackFidelity = Math.max(
		0,
		Math.min(1, result.benchmark.comparison.feasible_probability_mass || 0.5)
	);

	return stages.map(stage => ({
		fragmentId: stage.fragmentId,
		nodeId: result.distributed_nodes_used > 1 ? 'distributed-runtime' : 'finance-coordinator',
		status: 'COMPLETED',
		attempts: 1,
		observedFidelityRatio: fallbackFidelity,
		observedFidelity: `${(fallbackFidelity * 100).toFixed(2)}%`,
		startedAt: null,
		startedAtLabel: formatRelativeTime(null, referenceDate),
		finishedAt: null,
		finishedAtLabel: formatRelativeTime(null, referenceDate),
		error: null
	}));
}

function buildTrackBFinancialQuantumSummary(result: FinancialAnalysisResult): RunQuantumSummary {
	const measuredProbabilities = result.asset_universe.slice(0, 16).map(asset => ({
		key: asset.ticker,
		value: asset.selection_probability
	}));
	const observableExpectations: RunMeasurementBucket[] = [
		{ key: 'classical objective', value: result.benchmark.classical.objective },
		{ key: 'quantum objective', value: result.benchmark.quantum.objective },
		{ key: 'objective gap', value: result.benchmark.comparison.objective_gap }
	];
	const entanglementEntropy = result.asset_universe.slice(0, 16).map(asset => ({
		key: asset.ticker,
		value: Math.max(0, Math.min(1, asset.selection_probability))
	}));
	const topBasisStates = [
		{
			basis_state: result.benchmark.quantum.bitstring,
			probability: result.benchmark.quantum.probability ?? 0,
			selected_assets: result.benchmark.quantum.selected_assets,
			objective: result.benchmark.quantum.objective
		},
		{
			basis_state: result.benchmark.classical.bitstring,
			probability: result.benchmark.comparison.optimum_probability ?? 0,
			selected_assets: result.benchmark.classical.selected_assets,
			objective: result.benchmark.classical.objective
		}
	];

	const maxAbsReturn = Math.max(
		...result.asset_universe.map(asset => Math.abs(asset.annualized_return)),
		1
	);
	const maxAbsSharpe = Math.max(...result.asset_universe.map(asset => Math.abs(asset.sharpe_like)), 1);
	const blochVectors = result.asset_universe.slice(0, 8).reduce<Record<string, Record<string, number>>>(
		(acc, asset) => {
			acc[asset.ticker] = {
				x: Math.max(-1, Math.min(1, asset.annualized_return / maxAbsReturn)),
				y: Math.max(-1, Math.min(1, asset.selection_probability * 2 - 1)),
				z: Math.max(-1, Math.min(1, asset.sharpe_like / maxAbsSharpe))
			};
			return acc;
		},
		{}
	);

	return {
		shots: result.dataset.period_count,
		measuredQubits: result.asset_universe.map((_, index) => index),
		countBuckets: [
			{ key: 'screened assets', value: result.dataset.asset_count },
			{ key: 'portfolio budget', value: result.request.budget },
			{ key: 'aligned periods', value: result.dataset.period_count },
			{ key: 'fragments', value: result.fragments_executed || FINANCIAL_FRAGMENTS_TOTAL }
		],
		measuredProbabilities,
		observableExpectations,
		entanglementEntropy,
		blochVectors,
		fidelity: {
			target_state: result.benchmark.classical.bitstring,
			estimated_execution_fidelity: result.benchmark.comparison.feasible_probability_mass,
			optimum_probability: result.benchmark.comparison.optimum_probability
		},
		topBasisStates,
		statevector: null,
		reducedDensityMatrices: null
	};
}

function buildTrackBFinancialCircuitText(job: FinancialJobResponse, result: FinancialAnalysisResult): string {
	const lines = [
		'Portfolio optimization summary',
		`Job id: ${job.job_id}`,
		`File: ${result.filename}`,
		`Dataset: ${result.dataset.input_layout} layout, ${result.row_count.toLocaleString()} rows x ${result.col_count} columns`,
		`Periods: ${result.dataset.period_count}, screened assets: ${result.dataset.asset_count}, budget: ${result.request.budget}`,
		`Classical optimum: ${result.benchmark.classical.bitstring} -> ${result.benchmark.classical.objective.toFixed(6)}`,
		`Quantum candidate: ${result.benchmark.quantum.bitstring} -> ${result.benchmark.quantum.objective.toFixed(6)}`,
		`Analysis duration: ${(result.analysis_duration_ms / 1000).toFixed(2)}s`,
		'',
		'Open the Finance page or run detail for the executed QASM, fragment routing, and state summary.'
	];
	return lines.join('\n');
}

/** Maps a financial CSV job into the same surfaces as circuit runs (plan, peers, fragments, analysis). */
export function buildFinancialRunDetailSnapshot({
	generatedAt,
	health,
	job,
	warnings = []
}: BuildFinancialRunDetailSnapshotInput): RunDetailSnapshot {
	const referenceDate = new Date(generatedAt);
	const baseSummary = toRunSummaryFromFinancialJob(job, referenceDate);
	const result = job.result ?? null;

	if (!result) {
		return {
			generatedAt,
			warnings,
			health: toRunHealthSummary(health),
			financialResult: null,
			run: {
				...baseSummary,
				circuitText: '',
				fragmentResults: [],
				quantumSummary: null
			},
			plan: null
		};
	}

	const quantumExecution = result.quantum_execution ?? null;
	const plan = quantumExecution
		? buildPlanSummary(quantumExecution.plan)
		: buildTrackBFinancialPlanFromResult(result, job.job_id);
	const fragmentResults = quantumExecution
		? mapFragmentResults(quantumExecution.fragment_results, referenceDate)
		: buildTrackBFinancialFragmentResults(job.job_id, result, referenceDate);
	const quantumSummary = quantumExecution
		? buildQuantumSummary(quantumExecution.quantum_result)
		: buildTrackBFinancialQuantumSummary(result);
	const circuitText =
		quantumExecution?.circuit_text && quantumExecution.circuit_text.trim()
			? quantumExecution.circuit_text
			: buildTrackBFinancialCircuitText(job, result);

	return {
		generatedAt,
		warnings,
		health: toRunHealthSummary(health),
		financialResult: result,
		run: {
			...baseSummary,
			planId: quantumExecution?.plan?.plan_id ?? job.job_id,
			circuitText,
			fragmentResults,
			quantumSummary
		},
		plan
	};
}

export function buildRunDetailSnapshot({
	generatedAt,
	health,
	job,
	plan,
	warnings = []
}: BuildRunDetailSnapshotInput): RunDetailSnapshot {
	const referenceDate = new Date(generatedAt);
	const summary = toRunSummaryFromDetail(job, referenceDate);

	return {
		generatedAt,
		warnings,
		health: toRunHealthSummary(health),
		run: {
			...summary,
			circuitText: job.circuit_text ?? '',
			fragmentResults: mapFragmentResults(job.result?.fragment_results ?? [], referenceDate),
			quantumSummary: buildQuantumSummary(job.result?.quantum_result ?? null)
		},
		plan: buildPlanSummary(plan)
	};
}
