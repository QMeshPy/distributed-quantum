// --- Backend (snake_case) types ---

export interface BackendFinancialSubmitResponse {
  job_id: string;
  status: string;
  problem_type: string;
}

export interface BackendFinancialJobSummary {
  job_id: string;
  filename: string;
  problem_type: string | null;
  status: string;
  row_count: number | null;
  col_count: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackendFinancialJobResponse {
  job_id: string;
  filename: string;
  problem_type: string | null;
  status: string;
  row_count: number | null;
  col_count: number | null;
  error: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface BackendFinancialComparisonResponse {
  job_id: string;
  filename: string;
  generated_at: string;
  fairness: Record<string, unknown>;
  dataset: Record<string, unknown>;
  problem: Record<string, unknown>;
  classical: Record<string, unknown>;
  quantum: Record<string, unknown>;
  scorecard: Record<string, unknown>;
  evidence: Record<string, unknown>;
  verdict: Record<string, unknown>;
}

// --- UI-facing camelCase types ---

export interface FinanceJobSummary {
  jobId: string;
  filename: string;
  problemType: string | null;
  status: string;
  rowCount: number | null;
  colCount: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceJobDetail {
  jobId: string;
  filename: string;
  problemType: string | null;
  status: string;
  rowCount: number | null;
  colCount: number | null;
  error: string | null;
  result: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceComparison {
  jobId: string;
  filename: string;
  generatedAt: string;
  fairness: Record<string, unknown>;
  dataset: Record<string, unknown>;
  problem: Record<string, unknown>;
  classical: Record<string, unknown>;
  quantum: Record<string, unknown>;
  scorecard: Record<string, unknown>;
  evidence: Record<string, unknown>;
  verdict: Record<string, unknown>;
}
