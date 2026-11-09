import type { PeerTaskState } from "../types-live";

interface PeerTaskStateMeta {
  label: string;
  badge: string;
}

export const PEER_TASK_STATE: Record<PeerTaskState, PeerTaskStateMeta> = {
  queued: { label: "Waiting", badge: "text-warning bg-warning/10 border-warning/25" },
  running: { label: "Running", badge: "text-info bg-info/10 border-info/25" },
  done: { label: "Done", badge: "text-success bg-success/10 border-success/25" },
  failed: { label: "Failed", badge: "text-danger bg-danger/10 border-danger/25" },
  superseded: { label: "Not needed", badge: "text-faint bg-surface-muted border-border" },
};

export const PEER_TASK_STATE_ORDER: PeerTaskState[] = [
  "running",
  "queued",
  "done",
  "failed",
  "superseded",
];
