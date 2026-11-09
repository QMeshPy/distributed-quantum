import type { PeerTaskState } from "../types-live";

interface PeerTaskStateMeta {
  label: string;
  badge: string;
}

export const PEER_TASK_STATE: Record<PeerTaskState, PeerTaskStateMeta> = {
  queued: { label: "Waiting", badge: "text-amber-400 bg-amber-400/10 border-amber-400/25" },
  running: { label: "Running", badge: "text-sky-400 bg-sky-400/10 border-sky-400/25" },
  done: { label: "Done", badge: "text-emerald-400 bg-emerald-400/10 border-emerald-400/25" },
  failed: { label: "Failed", badge: "text-red-400 bg-red-400/10 border-red-400/25" },
  superseded: { label: "Not needed", badge: "text-white/30 bg-white/5 border-white/10" },
};

export const PEER_TASK_STATE_ORDER: PeerTaskState[] = [
  "running",
  "queued",
  "done",
  "failed",
  "superseded",
];
