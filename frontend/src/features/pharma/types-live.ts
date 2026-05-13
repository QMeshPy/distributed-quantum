export interface ScorePoint {
  iteration: number;
  score: number;
  ts: string;
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
}
