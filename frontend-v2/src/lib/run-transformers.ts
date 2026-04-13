import type {
	BackendHealthResponse,
	BackendJobListItemResponse,
	BackendJobProgressResponse,
	BackendJobQuantumResult,
	BackendJobStatusResponse,
	BackendPlanResponse
} from '@/types/backend';
import { getRunBadgeVariant, getRunStatusGroup, getRunStatusLabel } from '@/lib/run-status';
import type {
	RunDetailSnapshot,
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
};

type BuildRunDetailSnapshotInput = {
	generatedAt: string;
	health: BackendHealthResponse | null;
	job: BackendJobStatusResponse;
	plan: BackendPlanResponse | null;
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

export function toRunSummaryFromDetail(job: BackendJobStatusResponse, referenceDate: Date): RunSummary {
	return {
		id: job.job_id,
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

export function buildRunsListSnapshot({
	generatedAt,
	health,
	jobs,
	warnings = [],
	jobsListUnavailable = false
}: BuildRunsListSnapshotInput): RunsListSnapshot {
	const referenceDate = new Date(generatedAt);
	const runs = sortRunSummaries(jobs.map(job => toRunSummaryFromListItem(job, referenceDate)));

	return {
		generatedAt,
		warnings,
		...(jobsListUnavailable ? { jobsListUnavailable: true } : {}),
		health: toRunHealthSummary(health),
		counts: countRuns(runs),
		runs
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
			fragmentResults: (job.result?.fragment_results ?? []).map(fragment => ({
				fragmentId: fragment.fragment_id,
				nodeId: fragment.node_id,
				status: fragment.status,
				attempts: fragment.attempts,
				observedFidelityRatio:
					typeof fragment.observed_fidelity === 'number' ? fragment.observed_fidelity : null,
				observedFidelity:
					typeof fragment.observed_fidelity === 'number'
						? `${(fragment.observed_fidelity * 100).toFixed(2)}%`
						: null,
				startedAt: fragment.started_at,
				startedAtLabel: formatRelativeTime(fragment.started_at, referenceDate),
				finishedAt: fragment.finished_at,
				finishedAtLabel: formatRelativeTime(fragment.finished_at, referenceDate),
				error: fragment.error
			})),
			quantumSummary: buildQuantumSummary(job.result?.quantum_result ?? null)
		},
		plan: buildPlanSummary(plan)
	};
}
