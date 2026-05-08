export interface BackendJobStatus {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress?: number;
  result?: unknown;
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface BackendPaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
