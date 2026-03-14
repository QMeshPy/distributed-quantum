export type JobStatus =
  | "QUEUED"
  | "COMPILING"
  | "RESERVING"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED"

export interface HealthResponse {
  status: string
  service: string
  version: string
  environment: string
  uptime_seconds: number
}

export interface ServiceResponse {
  node_id: string
  listen_addrs: string[]
  service_type: string
  fidelity: number
  qubit_min: number
  qubit_max: number
  availability: boolean
  updated_at: string
}

export interface FidelitySampleResponse {
  service_type: string
  fidelity: number
  availability: boolean
  updated_at: string
}

export interface FidelityMetricsResponse {
  node_id: string
  sample_count: number
  average_fidelity: number
  min_fidelity: number
  max_fidelity: number
  samples: FidelitySampleResponse[]
}

export interface CircuitSubmitResponse {
  job_id: string
  status: JobStatus
}

export interface FragmentResult {
  attempts: number
  error: string | null
  finished_at: string | null
  fragment_id: string
  node_id: string
  observed_fidelity: number | null
  started_at: string | null
  status: string
}

export interface TopBasisState {
  amplitude: string
  basis_state: string
  probability: number
}

export interface FidelitySummary {
  estimated_execution_fidelity?: number
  fidelity_to_target_state?: number
  target_state?: string
}

export interface JobQuantumResult {
  counts: Record<string, number> | null
  probabilities: Record<string, number> | null
  measured_probabilities: Record<string, number> | null
  statevector: string[] | null
  shots: number | null
  measured_qubits: number[] | null
  observable_expectations: Record<string, number> | null
  reduced_density_matrices: Record<string, string[][]> | null
  bloch_vectors: Record<string, Record<string, number>> | null
  entanglement_entropy: Record<string, number> | null
  fidelity: FidelitySummary | null
  top_basis_states: TopBasisState[] | null
}

export interface JobRequestOptions {
  detail?: "full" | "summary"
  signal?: AbortSignal
}

export interface JobResult {
  job_id: string
  fragment_results: FragmentResult[]
  quantum_result: JobQuantumResult | null
}

export interface JobProgress {
  total_fragments: number
  completed_fragments: number
  active_fragments: number
  completion_ratio: number
  latest_event_at: string | null
  finalizing: boolean
}

export interface JobStatusResponse {
  job_id: string
  status: JobStatus
  plan_id: string | null
  error: string | null
  result: JobResult | null
  progress: JobProgress | null
  created_at: string
  updated_at: string
}

export interface PlanFragment {
  fragment_id: string
  service_type: string
  qubits: number[]
  operation_ids: string[]
  dependencies: string[]
}

export interface PlanCandidate {
  node_id: string
  total_cost: number
  latency_cost: number
  failure_risk_cost: number
  entanglement_cost: number
  load_cost: number
  fidelity: number
}

export interface PlanAssignment {
  fragment_id: string
  primary_node_id: string
  fallback_node_ids: string[]
  candidates: PlanCandidate[]
}

export interface PlanResponse {
  plan_id: string
  fragment_order: string[]
  fragments: Record<string, PlanFragment>
  assignments: Record<string, PlanAssignment>
  quality_snapshot_id: string
}

export interface JobUpdateResponse {
  job_id: string
  status: JobStatus
  error: string | null
  progress: JobProgress | null
  updated_at: string
}

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8080"

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "")
}

export function getApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_BASE_URL?.trim()
  if (envUrl) {
    return normalizeBaseUrl(envUrl)
  }

  if (
    typeof window !== "undefined" &&
    window.location.port === "8080" &&
    window.location.protocol.startsWith("http")
  ) {
    return normalizeBaseUrl(window.location.origin)
  }

  return DEFAULT_API_BASE_URL
}

export function getJobUpdatesUrl(jobId: string) {
  return `${getApiBaseUrl().replace(/^http/i, "ws")}/api/v1/jobs/${jobId}/ws`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  })

  const isJson = response.headers.get("content-type")?.includes("application/json")

  if (!response.ok) {
    const payload = isJson
      ? ((await response.json()) as { detail?: string })
      : { detail: await response.text() }

    throw new Error(payload.detail || `Request failed with status ${response.status}`)
  }

  if (!isJson) {
    throw new Error("Unexpected response content type")
  }

  return (await response.json()) as T
}

export function getHealth(signal?: AbortSignal) {
  return request<HealthResponse>("/api/v1/health", { signal })
}

export function getServices(signal?: AbortSignal) {
  return request<ServiceResponse[]>("/api/v1/services", { signal })
}

export function getFidelityMetrics(nodeId: string, signal?: AbortSignal) {
  return request<FidelityMetricsResponse>(`/api/v1/metrics/fidelity/${nodeId}`, {
    signal,
  })
}

export function submitCircuit(circuit: string, signal?: AbortSignal) {
  return request<CircuitSubmitResponse>("/api/v1/circuits/submit", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ circuit }),
  })
}

export function getJob(jobId: string, options?: JobRequestOptions) {
  const params = new URLSearchParams()
  if (options?.detail) {
    params.set("result_detail", options.detail)
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : ""
  return request<JobStatusResponse>(`/api/v1/jobs/${jobId}${suffix}`, {
    signal: options?.signal,
  })
}

export function getPlan(planId: string, signal?: AbortSignal) {
  return request<PlanResponse>(`/api/v1/plans/${planId}`, { signal })
}
