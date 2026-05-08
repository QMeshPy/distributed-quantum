export type BackendJobStatus =
  | "queued"
  | "compiling"
  | "reserving"
  | "executing"
  | "completed"
  | "failed";

export interface BackendJobProgress {
  total_fragments: number;
  completed_fragments: number;
  active_fragments: number;
  completion_ratio: number;
  latest_event_at: string;
  finalizing: boolean;
}

export interface BackendJobListItem {
  job_id: string;
  status: string;
  plan_id: string | null;
  error: string | null;
  progress: BackendJobProgress | null;
  circuit_preview: string;
  result_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface BackendFragmentResult {
  fragment_id: string;
  node_id: string;
  status: string;
  attempts: number;
  started_at: string | null;
  finished_at: string | null;
  observed_fidelity: number | null;
  error: string | null;
  stage_index?: number | null;
  component_qubits?: number[] | null;
  gate_count?: number | null;
  circuit_depth?: number | null;
  state_handoff_from_node_ids?: string[];
  state_transfer_bytes?: number | null;
}

export interface BackendQuantumResult {
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
}

export interface BackendJobResult {
  job_id: string;
  fragment_results: BackendFragmentResult[];
  quantum_result: BackendQuantumResult | null;
}

export interface BackendJobDetail {
  job_id: string;
  status: string;
  plan_id: string | null;
  error: string | null;
  result: BackendJobResult | null;
  progress: BackendJobProgress | null;
  circuit_text: string;
  created_at: string;
  updated_at: string;
}

export interface CircuitSubmitRequest {
  circuit: string;
}

export interface CircuitSubmitResponse {
  job_id: string;
  status: string;
}

// --- UI-facing camelCase types ---

export interface JobProgress {
  totalFragments: number;
  completedFragments: number;
  activeFragments: number;
  completionRatio: number;
  latestEventAt: string;
  finalizing: boolean;
}

export interface RunSummary {
  jobId: string;
  status: string;
  planId: string | null;
  error: string | null;
  progress: JobProgress | null;
  circuitPreview: string;
  resultAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FragmentResult {
  fragmentId: string;
  nodeId: string;
  status: string;
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
  observedFidelity: number | null;
  error: string | null;
  stageIndex: number | null;
  componentQubits: number[] | null;
  gateCount: number | null;
  circuitDepth: number | null;
  stateHandoffFrom: string[];
  stateTransferBytes: number | null;
}

export interface QuantumResult {
  counts: Record<string, number> | null;
  probabilities?: Record<string, number> | null;
  statevector?: string[] | null;
  shots?: number | null;
  measuredQubits?: number[] | null;
  observableExpectations?: Record<string, number> | null;
  reducedDensityMatrices?: Record<string, string[][]> | null;
  blochVectors?: Record<string, Record<string, number>> | null;
  entanglementEntropy?: Record<string, number> | null;
  fidelity?: Record<string, unknown> | null;
  topBasisStates?: Array<Record<string, unknown>> | null;
}

export interface RunDetail {
  jobId: string;
  status: string;
  planId: string | null;
  error: string | null;
  result: {
    jobId: string;
    fragmentResults: FragmentResult[];
    quantumResult: QuantumResult | null;
  } | null;
  progress: JobProgress | null;
  circuitText: string;
  createdAt: string;
  updatedAt: string;
}
