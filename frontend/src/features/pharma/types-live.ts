export interface ScorePoint {
  iteration: number;
  score: number;
  ts: string;
}

export type PeerTaskState = "queued" | "running" | "done" | "failed" | "superseded";

/** One VQE task of the current iteration, as reported by the backend while the job runs. */
export interface PeerTask {
  task: number;
  fragment: string;
  start: number;
  state: PeerTaskState;
  peer: string | null;
  peer_id: string | null;
  started_at: number | null;
  seconds: number | null;
  error: string | null;
}

export interface LiveJobState {
  job_id: string;
  current_stage: string | null;
  iteration_count: number;
  best_smiles: string | null;
  best_score: number | null;
  score_history: ScorePoint[];
  admet_passes: number;
  elapsed_seconds: number;
  peer_tasks: PeerTask[];
  server_time: number;
}
