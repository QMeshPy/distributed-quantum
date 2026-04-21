export type BackendHealthResponse = {
	status: string;
	service: string;
	version: string;
	environment: string;
	uptime_seconds: number;
};

export type BackendJobStatus = 'QUEUED' | 'COMPILING' | 'RESERVING' | 'EXECUTING' | 'COMPLETED' | 'FAILED';

export type BackendCircuitSubmitRequest = {
	circuit: string;
};

export type BackendCircuitSubmitResponse = {
	job_id: string;
	status: BackendJobStatus;
};

export type BackendJobProgressResponse = {
	total_fragments: number;
	completed_fragments: number;
	active_fragments: number;
	completion_ratio: number;
	latest_event_at: string | null;
	finalizing: boolean;
};

export type BackendJobFragmentResult = {
	fragment_id: string;
	node_id: string;
	status: string;
	attempts: number;
	started_at: string | null;
	finished_at: string | null;
	observed_fidelity: number | null;
	error: string | null;
};

export type BackendJobQuantumResult = {
	counts: Record<string, number> | null;
	probabilities?: Record<string, number> | null;
	measured_probabilities?: Record<string, number> | null;
	statevector?: string[] | null;
	shots?: number | null;
	measured_qubits?: number[] | null;
	observable_expectations?: Record<string, number> | null;
	reduced_density_matrices?: Record<string, string[][]> | null;
	bloch_vectors?: Record<string, Record<string, number>> | null;
	entanglement_entropy?: Record<string, number> | null;
	fidelity?: Record<string, unknown> | null;
	top_basis_states?: Array<Record<string, unknown>> | null;
};

export type BackendJobResult = {
	job_id: string;
	fragment_results: BackendJobFragmentResult[];
	quantum_result: BackendJobQuantumResult | null;
};

export type BackendJobStatusResponse = {
	job_id: string;
	status: BackendJobStatus;
	plan_id: string | null;
	error: string | null;
	result: BackendJobResult | null;
	progress: BackendJobProgressResponse | null;
	/** Present on current coordinators; older API builds may omit this field. */
	circuit_text?: string;
	created_at: string;
	updated_at: string;
};

export type BackendJobListItemResponse = {
	job_id: string;
	status: BackendJobStatus;
	plan_id: string | null;
	error: string | null;
	progress: BackendJobProgressResponse | null;
	circuit_preview: string;
	result_available: boolean;
	created_at: string;
	updated_at: string;
};

export type BackendServiceResponse = {
	node_id: string;
	listen_addrs: string[];
	service_type: string;
	fidelity: number;
	qubit_min: number;
	qubit_max: number;
	availability: boolean;
	updated_at: string;
};

export type BackendFidelitySampleResponse = {
	service_type: string;
	fidelity: number;
	availability: boolean;
	updated_at: string;
};

export type BackendFidelityMetricsResponse = {
	node_id: string;
	sample_count: number;
	average_fidelity: number;
	min_fidelity: number;
	max_fidelity: number;
	samples: BackendFidelitySampleResponse[];
};

export type BackendPlanCandidateResponse = {
	node_id: string;
	total_cost: number;
	latency_cost: number;
	failure_risk_cost: number;
	entanglement_cost: number;
	load_cost: number;
	fidelity: number;
};

export type BackendPlanFragmentResponse = {
	fragment_id: string;
	service_type: string;
	qubits: number[];
	operation_ids: string[];
	dependencies: string[];
};

export type BackendPlanAssignmentResponse = {
	fragment_id: string;
	primary_node_id: string;
	fallback_node_ids: string[];
	block_id?: string | null;
	stage_index?: number | null;
	candidates: BackendPlanCandidateResponse[];
};

export type BackendPlanStageResponse = {
	stage_id: string;
	stage_index: number;
	block_ids: string[];
	fragment_ids: string[];
};

export type BackendPlanBlockResponse = {
	block_id: string;
	stage_index: number;
	fragment_ids: string[];
	service_types: string[];
	active_qubits: number[];
	state_qubits: number[];
	input_component_qubits: number[][];
	dependencies: string[];
	primary_node_id: string;
	fallback_node_ids: string[];
	candidates: BackendPlanCandidateResponse[];
};

export type BackendPlanResponse = {
	plan_id: string;
	fragment_order: string[];
	fragments: Record<string, BackendPlanFragmentResponse>;
	assignments: Record<string, BackendPlanAssignmentResponse>;
	stages?: BackendPlanStageResponse[];
	blocks?: Record<string, BackendPlanBlockResponse>;
	quality_snapshot_id: string | null;
};
