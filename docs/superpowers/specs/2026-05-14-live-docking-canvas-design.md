# Live Docking Canvas — Design Spec

**Date:** 2026-05-14  
**Feature:** Real-time visual docking canvas for pharma pipeline jobs  
**Status:** Approved for implementation

---

## 1. Problem

When a user submits a pharma docking pipeline, the job page shows a text log feed. There is no visual representation of the biology happening — no protein, no ligand improving over iterations, no sense of "watching it work." The goal is a full-page immersive canvas that makes the live biology tangible.

---

## 2. Scope

- New backend endpoint returning structured live state during a run
- New frontend hook to poll it
- New `PharmaLiveCanvas` full-page component shown while the job is running
- `PharmaJobDetail` transitions from canvas → result view when the job completes
- No changes to the existing text log feed (it stays, shown after completion)

Out of scope: WebSockets/SSE, persisting live state to a database, replay of past runs.

---

## 3. Backend: `/api/v1/pharma/jobs/{job_id}/live`

### 3.1 Response model

```python
class LiveJobState(BaseModel):
    job_id: str
    current_stage: str | None          # e.g. "docking", "scoring"
    iteration_count: int
    best_smiles: str | None            # SMILES of best candidate found so far
    best_score: float | None           # binding affinity kcal/mol (lower = better)
    score_history: list[ScorePoint]    # ordered list, one entry per iter with improvement
    admet_passes: int
    elapsed_seconds: float

class ScorePoint(BaseModel):
    iteration: int
    score: float                       # kcal/mol
    ts: str                            # ISO timestamp
```

### 3.2 Storage

A module-level `dict[str, LiveJobState]` keyed by `job_id` in the pharma router/service module. The pipeline worker updates it in-place as it runs:

- On each stage transition: update `current_stage`
- On each iteration: increment `iteration_count`, update `elapsed_seconds`
- When a new best score is found: update `best_smiles`, `best_score`, append to `score_history`
- On each ADMET pass: increment `admet_passes`

The dict entry is created when the job starts and deleted when the job reaches a terminal state (completed/failed/cancelled). This is pure in-memory — no DB writes needed.

### 3.3 Endpoint behaviour

- Returns 200 with `LiveJobState` while the job exists in the dict
- Returns 404 if the job is not running (terminal or not started yet) — the frontend treats this as "no live data available"
- No auth changes needed (same auth as the existing job endpoints)

---

## 4. Frontend: Hook

**File:** `frontend/src/features/pharma/hooks/use-pharma-job-live.ts`

```ts
usePharmaJobLive(jobId: string, enabled: boolean): {
  data: LiveJobState | null,
  isLoading: boolean
}
```

- Polls `GET /api/v1/pharma/jobs/{job_id}/live` every **2 seconds** when `enabled === true`
- `enabled` is driven by `job.status === "running" || job.status === "queued"`
- On 404, returns `null` data (not an error — just means live state not available yet)
- Stops polling when `enabled` becomes false

---

## 5. Frontend: `PharmaLiveCanvas` Component

**File:** `frontend/src/features/pharma/components/pharma-live-canvas.tsx`

### 5.1 Props

```ts
interface Props {
  jobId: string;
  targetPdbId: string;
  mode: PharmaMode;
  status: PharmaJobStatus;
  onCancel: () => void;
  isCancelling: boolean;
}
```

### 5.2 Layout

Full content-area, edge-to-edge, no page padding. Horizontal split, 50/50:

```
┌─────────────────────────┬─────────────────────────┐
│                         │  STAT STRIP              │
│   NGL ProteinViewer     │  Stage · Iter · Score · ADMET
│   (interactive WebGL)   │─────────────────────────│
│                         │  SCORE CHART             │
│   ─ on new best ligand: │  recharts LineChart      │
│     swap ligand in NGL  │  iteration → kcal/mol    │
│   ─ on stage change:    │─────────────────────────│
│     autoView() refocus  │  BEST LIGAND             │
│   ─ on candidate found: │  LigandViewer 2D SMILES  │
│     pocket pulses        │─────────────────────────│
│                         │  DISCOVERED SO FAR       │
│                         │  thumbnail strip         │
└─────────────────────────┴─────────────────────────┘
```

A thin top bar above both panels holds: job title, status badge (with spinner if running), Cancel button, and "3D + Live" label.

### 5.3 Left panel — Protein viewer behaviour

- `ProteinViewer` loads immediately on mount using `targetPdbId`
- When `liveData.best_smiles` first arrives: load ligand into NGL stage via `stage.loadFile` with a SMILES-to-structure conversion. Use NGL's built-in SMILES loader (`smiles://<smiles_string>`) with `ball+stick` representation in `text-emerald-400` equivalent color.
- When `best_smiles` changes (better candidate): remove previous ligand component, load new one. Brief opacity pulse on the binding pocket surface component (0.18 → 0.45 → 0.18 over 600ms via `setParameters` calls).
- When `current_stage` changes: call `stage.autoView(800)` to smoothly re-center on the structure.
- User can still rotate/zoom freely at all times — NGL handles this natively.

### 5.4 Right panel — Stat strip

Four cards using `motion.div` from the `motion` library. When a value changes, trigger a brief `scale: [1, 1.06, 1]` spring animation on that card.

| Card | Value | Color |
|------|-------|-------|
| Stage | `current_stage` label from STAGE_ICONS map | stage color |
| Iterations | `iteration_count` | violet-300 |
| Best Score | `best_score` kcal/mol, 2dp | rose-300 |
| ADMET Passes | `admet_passes` | teal-300 |

All show `—` until data arrives.

### 5.5 Right panel — Score chart

`recharts` `LineChart`, responsive width, fixed height 180px.

- X axis: iteration number (integer)
- Y axis: binding affinity kcal/mol (inverted domain so lower values appear higher — more intuitive "improving" visual)
- Data: `liveData.score_history` array, updated every 2s poll
- Dot shown only on the last point (current best)
- `isAnimationActive={false}` on the line itself for instant updates; use a CSS transition on the SVG path instead for smoothness
- Show a faint horizontal reference line at 0 kcal/mol
- Color: rose-400 line, rose-400/20 area fill below

### 5.6 Right panel — Best ligand + discovered strip

**Best ligand:** `LigandViewer` component (already exists) fed `liveData.best_smiles`. Height 160px. Updates when `best_smiles` changes — `LigandViewer` already handles SMILES change via its `useEffect`.

**Discovered strip:** A horizontal scroll row of small `LigandViewer` thumbnails (80×60px each). Each ADMET pass appends one. Strip grows left-to-right, auto-scrolls right when a new one is added. Maximum 20 shown (oldest dropped from left).

---

## 6. Integration into `PharmaJobDetail`

`PharmaJobDetail` gets a simple conditional at the top of its return:

```tsx
if (isRunning) {
  return (
    <PharmaLiveCanvas
      jobId={jobId}
      targetPdbId={job.target_pdb_id}
      mode={job.mode}
      status={job.status}
      onCancel={() => cancelJob()}
      isCancelling={isCancelling}
    />
  );
}
// existing result layout below...
```

When the job transitions from `running` → `completed`, `usePharmaJob` returns the new status and `PharmaJobDetail` re-renders into the result view (candidates list, stats, log). No explicit transition animation needed — the switch is instant and the result view has its own content.

---

## 7. Types

New file: `frontend/src/features/pharma/types-live.ts`

```ts
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
```

---

## 8. Error Handling

| Scenario | Behaviour |
|----------|-----------|
| `/live` returns 404 | Show canvas with `—` placeholders; protein still loads |
| `/live` fetch fails (network) | Silently retry on next poll; no error UI |
| NGL fails to load SMILES ligand | Skip ligand overlay; protein still shows |
| NGL fails to load protein | Show error state in left panel, right panel still works |
| Job transitions to `failed` | `PharmaJobDetail` exits canvas mode, shows error banner in result view |
| Job transitions to `cancelled` | Same as failed |

---

## 9. Files to Create / Modify

| Action | File |
|--------|------|
| Create | `backend/src/quantum_backend_v2/pharma/live_state.py` |
| Modify | `backend/src/quantum_backend_v2/api/routers/pharma.py` |
| Modify | `backend/src/quantum_backend_v2/pharma/pipeline.py` (or equivalent worker) |
| Create | `frontend/src/features/pharma/types-live.ts` |
| Create | `frontend/src/features/pharma/hooks/use-pharma-job-live.ts` |
| Create | `frontend/src/features/pharma/components/pharma-live-canvas.tsx` |
| Modify | `frontend/src/features/pharma/components/pharma-job-detail.tsx` |
| Modify | `frontend/src/shared/constants/backend.ts` (add live endpoint URL) |

---

## 10. Out of Scope

- Persisting live state across server restarts
- Showing live state for already-completed jobs (replay)
- Mobile layout (existing dashboard is desktop-first)
- WebSocket/SSE migration (polling every 2s is sufficient for this use case)
