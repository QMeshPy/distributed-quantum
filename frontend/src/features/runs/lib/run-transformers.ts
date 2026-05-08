import type {
  BackendJobListItem,
  BackendJobDetail,
  BackendFragmentResult,
  BackendQuantumResult,
  RunSummary,
  RunDetail,
  JobProgress,
  FragmentResult,
  QuantumResult,
} from "../types";

export function transformProgress(
  p: BackendJobListItem["progress"],
): JobProgress | null {
  if (!p) return null;
  return {
    totalFragments: p.total_fragments,
    completedFragments: p.completed_fragments,
    activeFragments: p.active_fragments,
    completionRatio: p.completion_ratio,
    latestEventAt: p.latest_event_at,
    finalizing: p.finalizing,
  };
}

export function transformRunSummary(item: BackendJobListItem): RunSummary {
  return {
    jobId: item.job_id,
    status: item.status,
    planId: item.plan_id,
    error: item.error,
    progress: transformProgress(item.progress),
    circuitPreview: item.circuit_preview,
    resultAvailable: item.result_available,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function transformFragmentResult(f: BackendFragmentResult): FragmentResult {
  return {
    fragmentId: f.fragment_id,
    nodeId: f.node_id,
    status: f.status,
    attempts: f.attempts,
    startedAt: f.started_at,
    finishedAt: f.finished_at,
    observedFidelity: f.observed_fidelity,
    error: f.error,
    stageIndex: f.stage_index ?? null,
    componentQubits: f.component_qubits ?? null,
    gateCount: f.gate_count ?? null,
    circuitDepth: f.circuit_depth ?? null,
    stateHandoffFrom: f.state_handoff_from_node_ids ?? [],
    stateTransferBytes: f.state_transfer_bytes ?? null,
  };
}

function transformQuantumResult(q: BackendQuantumResult): QuantumResult {
  return {
    counts: q.counts,
    probabilities: q.measured_probabilities ?? q.probabilities,
    statevector: q.statevector,
    shots: q.shots,
    measuredQubits: q.measured_qubits,
    observableExpectations: q.observable_expectations,
    reducedDensityMatrices: q.reduced_density_matrices,
    blochVectors: q.bloch_vectors,
    entanglementEntropy: q.entanglement_entropy,
    fidelity: q.fidelity,
    topBasisStates: q.top_basis_states,
  };
}

export function transformRunDetail(d: BackendJobDetail): RunDetail {
  return {
    jobId: d.job_id,
    status: d.status,
    planId: d.plan_id,
    error: d.error,
    result: d.result
      ? {
          jobId: d.result.job_id,
          fragmentResults: d.result.fragment_results.map(transformFragmentResult),
          quantumResult: d.result.quantum_result
            ? transformQuantumResult(d.result.quantum_result)
            : null,
        }
      : null,
    progress: transformProgress(d.progress),
    circuitText: d.circuit_text,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

export function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "failed";
}
