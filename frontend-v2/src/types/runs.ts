import type { BackendJobStatus } from '@/types/backend';
import type { FinancialAnalysisResult, FinancialProblemType } from '@/types/financial';

/** Financial job statuses from the coordinator (distinct from circuit jobs). */
export type FinancialJobStatus = 'QUEUED' | 'INGESTING' | 'ANALYSING' | 'COMPLETED' | 'FAILED';

/** List row from `GET /api/v1/finance`. */
export type BackendFinancialJobListItem = {
	job_id: string;
	problem_type?: FinancialProblemType | null;
	status: FinancialJobStatus;
	filename: string;
	row_count: number | null;
	col_count: number | null;
	error: string | null;
	created_at: string;
	updated_at: string;
};

/** Status shown on unified run history rows (circuit or financial). */
export type RunListBackendStatus = BackendJobStatus | FinancialJobStatus;

export type RunBadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';
export type RunStatusFilter = 'all' | 'queued' | 'running' | 'completed' | 'failed';
export type RunStatusGroup = Exclude<RunStatusFilter, 'all'>;

export type RunsApiError = {
	error: string;
	details?: string;
};

export type RunHealthSummary = {
	status: string;
	service: string;
	version: string;
	environment: string;
	uptimeLabel: string;
};

export type RunProgressSummary = {
	totalFragments: number;
	completedFragments: number;
	activeFragments: number;
	completionRatio: number;
	completionPercentage: number;
	latestEventAt: string | null;
	latestEventLabel: string;
	finalizing: boolean;
};

export type RunSummary = {
	id: string;
	/** Circuit execution vs financial CSV analysis vs real options pricing. */
	jobKind?: 'circuit' | 'financial' | 'options';
	backendStatus: RunListBackendStatus;
	statusLabel: string;
	statusGroup: RunStatusGroup;
	badgeVariant: RunBadgeVariant;
	circuitPreview: string;
	planId: string | null;
	error: string | null;
	resultAvailable: boolean;
	createdAt: string;
	createdAtLabel: string;
	updatedAt: string;
	updatedAtLabel: string;
	progress: RunProgressSummary | null;
};

export type RunsCountSummary = {
	total: number;
	queued: number;
	running: number;
	completed: number;
	failed: number;
};

export type RunsListSnapshot = {
	generatedAt: string;
	warnings: string[];
	/**
	 * True when the coordinator did not return a jobs list (e.g. missing GET /api/v1/jobs),
	 * so `runs` is empty even if jobs exist in the database.
	 */
	jobsListUnavailable?: boolean;
	health: RunHealthSummary | null;
	counts: RunsCountSummary;
	runs: RunSummary[];
};

export type RunMeasurementBucket = {
	key: string;
	value: number;
};

export type RunFragmentResultSummary = {
	fragmentId: string;
	nodeId: string;
	status: string;
	attempts: number;
	/** Raw coordinator value in [0, 1], when provided. */
	observedFidelityRatio: number | null;
	observedFidelity: string | null;
	startedAt: string | null;
	startedAtLabel: string;
	finishedAt: string | null;
	finishedAtLabel: string;
	error: string | null;
};

export type RunQuantumSummary = {
	shots: number | null;
	measuredQubits: number[];
	countBuckets: RunMeasurementBucket[];
	measuredProbabilities: RunMeasurementBucket[];
	observableExpectations: RunMeasurementBucket[];
	entanglementEntropy: RunMeasurementBucket[];
	blochVectors: Record<string, Record<string, number>> | null;
	fidelity: Record<string, unknown> | null;
	topBasisStates: Array<Record<string, unknown>>;
	/** Populated when the job is fetched with `result_detail=full`. */
	statevector: string[] | null;
	/** Populated when the job is fetched with `result_detail=full`. */
	reducedDensityMatrices: Record<string, string[][]> | null;
};

export type RunPlanCandidateSummary = {
	nodeId: string;
	totalCost: number;
	latencyCost: number;
	failureRiskCost: number;
	loadCost: number;
	/** Planner fidelity score in [0, 1]. */
	fidelity: number;
};

export type RunPlanFragmentSummary = {
	fragmentId: string;
	serviceType: string;
	qubits: number[];
	qubitsLabel: string;
	operationIds: string[];
	dependencies: string[];
	operationCount: number;
	dependencyCount: number;
	primaryNodeId: string | null;
	fallbackNodeIds: string[];
	candidateCount: number;
	candidates: RunPlanCandidateSummary[];
};

export type RunPlanSummary = {
	planId: string;
	qualitySnapshotId: string | null;
	fragmentOrder: string[];
	fragments: RunPlanFragmentSummary[];
};

export type RunDetail = RunSummary & {
	circuitText: string;
	fragmentResults: RunFragmentResultSummary[];
	quantumSummary: RunQuantumSummary | null;
};

export type RunDetailSnapshot = {
	generatedAt: string;
	warnings: string[];
	health: RunHealthSummary | null;
	run: RunDetail;
	plan: RunPlanSummary | null;
	/** Populated for financial CSV runs so deep analysis UI can render without another fetch. */
	financialResult?: FinancialAnalysisResult | null;
};
