"use client";

import { Button } from "@/components/arc/button/button";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import {
  Activity,
  Ban,
  FlaskConical,
  Loader2,
  Star,
} from "lucide-react";
import { usePharmaJob } from "@/features/pharma/hooks/use-pharma-job";
import { useCancelPharma } from "@/features/pharma/hooks/use-cancel-pharma";
import { CandidateCard } from "./candidate-card";
import { PageHeader } from "@/shared/components/layout/page-header";
import type { PipelineLogEntry, PipelineLogLevel } from "../types";
import {
  LOG_META,
  STAGE_ICONS,
  STAGE_ORDER,
  type LogMeta,
} from "../lib/pharma-stage-config";

// NGL uses window + WebGL, must be client-only, no SSR
const ProteinViewer = dynamic(
  () => import("./protein-viewer").then((m) => ({ default: m.ProteinViewer })),
  { ssr: false },
);

const PharmaLiveCanvas = dynamic(
  () => import("./pharma-live-canvas").then((m) => ({ default: m.PharmaLiveCanvas })),
  { ssr: false },
);

// ── Status colours ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  queued: "text-warning bg-warning/10 border-warning/25",
  running: "text-info bg-info/10 border-info/25",
  completed: "text-success bg-success/10 border-success/25",
  failed: "text-danger bg-danger/10 border-danger/25",
  cancelled: "text-faint bg-surface-muted border-border",
};

// ── Log-level visual config imported from pharma-stage-config ───────────────




// Quantum-internal levels hidden from the biology feed
const QUANTUM_LEVELS = new Set<PipelineLogLevel>(["vqe"]);

// ── Sub-components ────────────────────────────────────────────────────────────

function LogLine({ entry }: { entry: PipelineLogEntry }) {
  const meta = LOG_META[entry.level] ?? LOG_META.info;
  const Icon = meta.icon;
  const time = new Date(entry.ts).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className={`flex items-start gap-2.5 rounded-md px-3 py-1.5 ${meta.bg}`}>
      <span className="mt-px shrink-0 font-mono text-xs text-faint">{time}</span>
      <span
        className={`mt-px flex h-4 w-[42px] shrink-0 items-center justify-center rounded text-xs font-medium ${meta.color} bg-surface-muted`}
      >
        {meta.label}
      </span>
      <Icon size={12} className={`mt-0.5 shrink-0 ${meta.color} opacity-70`} />
      <span className={`font-mono text-xs leading-relaxed ${meta.color}`}>
        {entry.message}
      </span>
    </div>
  );
}

function StageStrip({ logLines }: { logLines: PipelineLogEntry[] }) {
  const seenStages = new Set(logLines.map((l) => l.stage).filter(Boolean));
  const lastStage = logLines.length > 0 ? logLines[logLines.length - 1].stage : null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {STAGE_ORDER.map((stage, idx) => {
        const meta = STAGE_ICONS[stage];
        if (!meta) return null;
        const Icon = meta.icon;
        const done = seenStages.has(stage);
        const active = lastStage === stage;
        return (
          <div key={stage} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-all ${
                active
                  ?`${meta.color} bg-surface-muted ring-1 ring-current/30`
                  : done
                  ? `${meta.color} opacity-50`
                  : "text-faint"
              }`}
            >
              {active && <Loader2 size={9} className="animate-spin" />}
              <Icon size={10} />
              <span className="text-xs font-medium">{meta.label}</span>
            </div>
            {idx < STAGE_ORDER.length - 1 && (
              <div className={`h-px w-3 ${done ?"bg-surface-raised" : "bg-surface-muted"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Live metrics extracted from biology log lines ─────────────────────────────

function extractLiveMetrics(logLines: PipelineLogEntry[]) {
  let currentStage: string | null = null;
  let iterCount = 0;
  let bestScore: number | null = null;
  let candidatesFound = 0;

  for (const line of logLines) {
    if (line.stage) currentStage = line.stage;
    if (line.level === "iter") iterCount++;
    if (line.level === "score") {
      const m = line.message.match(/([-\d.]+)/);
      if (m) {
        const v = parseFloat(m[1]);
        if (bestScore === null || v < bestScore) bestScore = v;
      }
    }
    if (line.level === "admet" && line.message.toLowerCase().includes("pass")) {
      candidatesFound++;
    }
  }

  return { currentStage, iterCount, bestScore, candidatesFound };
}

// ── Main component ────────────────────────────────────────────────────────────

export function PharmaJobDetail({ jobId }: { jobId: string }) {
  const { data: job, isLoading, error } = usePharmaJob(jobId);
  const { mutate: cancelJob, isPending: isCancelling } = useCancelPharma(jobId);
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [job?.log_lines?.length]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={22} className="animate-spin text-faint" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="p-6">
        <p className="text-sm text-danger">
          {error instanceof Error ? error.message : "Job not found"}
        </p>
      </div>
    );
  }

  const isRunning = job.status === "queued" || job.status === "running";

  if (isRunning || job.status === "completed") {
    return (
      <PharmaLiveCanvas
        job={job}
        onCancel={() => cancelJob()}
        isCancelling={isCancelling}
      />
    );
  }
  const allLogLines = job.log_lines ?? [];
  // Strip quantum-internal levels, show only biology events
  const bioLogLines = allLogLines.filter((l) => !QUANTUM_LEVELS.has(l.level));
  const metrics = extractLiveMetrics(bioLogLines);
  const stageMeta = metrics.currentStage ? STAGE_ICONS[metrics.currentStage] : null;
  const ActiveStageIcon = stageMeta?.icon ?? Activity;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={FlaskConical}
        title={`${job.target_pdb_id}, ${job.mode.charAt(0).toUpperCase() + job.mode.slice(1)}`}
        description={jobId}
      />

      <div className="flex flex-1 flex-col gap-4 p-6">
        {/* ── Top bar: status + controls ──────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface-muted px-5 py-3">
          <span
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
              STATUS_COLORS[job.status] ?? "text-subtle",
            ].join(" ")}
          >
            {isRunning && <Loader2 size={10} className="animate-spin" />}
            <span className="capitalize">{job.status}</span>
          </span>

          <div className="h-4 w-px bg-surface-muted" />

          <span className="font-mono text-sm text-foreground">{job.target_pdb_id}</span>
          <span className="text-sm capitalize text-faint">{job.mode}</span>

          {job.result && (
            <>
              <div className="h-4 w-px bg-surface-muted" />
              <span className="text-xs text-subtle">
                {job.result.candidates.length} candidates · {job.result.total_runtime_seconds.toFixed(1)}s · {job.result.iterations_used} iters
              </span>
            </>
          )}

          {job.completed_at && (
            <span className="ml-auto text-xs text-faint">
              {new Date(job.completed_at).toLocaleString()}
            </span>
          )}

          {isRunning && (
            <Button variant="danger" size="sm"
              onClick={() => cancelJob()}
              disabled={isCancelling}
              className="ml-auto">
              {isCancelling ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />}
              {isCancelling ? "Cancelling…" : "Cancel Job"}
            </Button>
          )}
        </div>

        {/* ── Error banner ────────────────────────────────────────────────── */}
        {job.error && (
          <div className="rounded-xl border border-danger/20 bg-danger/5 px-5 py-4">
            <p className="font-mono text-sm text-danger">{job.error}</p>
          </div>
        )}

        {/* ── Live biology hero panel ──────────────────────────────────────── */}
        {(bioLogLines.length > 0 || isRunning) && (
          <div className="flex flex-col overflow-hidden rounded-xl border border-success/12 bg-background">

            {/* Hero header */}
            <div className="flex items-center gap-3 border-b border-border bg-success/4 px-5 py-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/10">
                <ActiveStageIcon size={14} className={stageMeta?.color ?? "text-success"} />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-foreground">
                  Live Docking Pipeline
                </span>
                {metrics.currentStage && (
                  <span className={`text-xs font-medium ${stageMeta?.color ??"text-success"}`}>
                    {stageMeta?.label ?? metrics.currentStage}
                  </span>
                )}
              </div>
              {isRunning && (
                <span className="ml-2 flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                  </span>
                  live
                </span>
              )}
              <span className="ml-auto text-xs text-faint">
                {bioLogLines.length} event{bioLogLines.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Live metrics strip */}
            <div className="grid grid-cols-2 divide-x divide-border border-b border-border sm:grid-cols-4">
              <div className="px-5 py-3">
                <p className="mb-1 text-xs text-faint">Stage</p>
                <p className={`text-sm font-medium ${stageMeta?.color ??"text-subtle"}`}>
                  {stageMeta?.label ?? (metrics.currentStage ?? "-")}
                </p>
              </div>
              <div className="px-5 py-3">
                <p className="mb-1 text-xs text-faint">Iterations</p>
                <p className="text-sm font-medium text-accent">
                  {metrics.iterCount > 0 ? metrics.iterCount : "-"}
                </p>
              </div>
              <div className="px-5 py-3">
                <p className="mb-1 text-xs text-faint">Best Dock Score</p>
                <p className="text-sm font-medium text-danger">
                  {metrics.bestScore !== null ? metrics.bestScore.toFixed(2) : "-"}
                </p>
              </div>
              <div className="px-5 py-3">
                <p className="mb-1 text-xs text-faint">ADMET Passes</p>
                <p className="text-sm font-medium text-success">
                  {metrics.candidatesFound > 0 ? metrics.candidatesFound : "-"}
                </p>
              </div>
            </div>

            {/* Stage progress strip */}
            {bioLogLines.length > 0 && (
              <div className="border-b border-border px-5 py-2.5">
                <StageStrip logLines={bioLogLines} />
              </div>
            )}

            {/* Biology event feed */}
            <div
              ref={consoleRef}
              className="flex max-h-[560px] min-h-[200px] flex-col gap-0.5 overflow-y-auto p-3 font-mono"
            >
              {bioLogLines.length === 0 && isRunning ? (
                <div className="flex items-center gap-2 px-2 py-4 text-xs text-faint">
                  <Loader2 size={11} className="animate-spin" />
                  Waiting for pipeline to start…
                </div>
              ) : (
                bioLogLines.map((entry, i) => <LogLine key={i} entry={entry} />)
              )}
            </div>

            {isRunning && (
              <div className="flex items-center gap-2 border-t border-border px-5 py-2 text-xs text-faint">
                <Loader2 size={9} className="animate-spin" />
                Refreshing every 3 s
              </div>
            )}
          </div>
        )}

        {/* ── Candidates ──────────────────────────────────────────────────── */}
        {job.result && job.result.candidates.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Star size={13} className="text-success" />
              <h2 className="text-xs font-medium text-faint">
                Top Candidates ({job.result.candidates.length})
              </h2>
            </div>
            {job.result.candidates.map((c) => (
              <CandidateCard key={c.rank} candidate={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
