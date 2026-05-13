"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import {
  Loader2,
  Star,
  Ban,
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
import { LigandViewer } from "./ligand-viewer";

// NGL uses window + WebGL — must be client-only, no SSR
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
  queued: "text-amber-400 bg-amber-400/10 border-amber-400/25",
  running: "text-sky-400 bg-sky-400/10 border-sky-400/25",
  completed: "text-emerald-400 bg-emerald-400/10 border-emerald-400/25",
  failed: "text-red-400 bg-red-400/10 border-red-400/25",
  cancelled: "text-white/30 bg-white/5 border-white/10",
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
      <span className="mt-px shrink-0 font-mono text-[10px] text-white/20">{time}</span>
      <span
        className={`mt-px flex h-4 w-[42px] shrink-0 items-center justify-center rounded text-[9px] font-bold uppercase tracking-wider ${meta.color} bg-white/5`}
      >
        {meta.label}
      </span>
      <Icon size={12} className={`mt-0.5 shrink-0 ${meta.color} opacity-70`} />
      <span className={`font-mono text-[11px] leading-relaxed ${meta.color}`}>
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
                  ? `${meta.color} bg-white/8 ring-1 ring-current/30`
                  : done
                  ? `${meta.color} opacity-50`
                  : "text-white/15"
              }`}
            >
              {active && <Loader2 size={9} className="animate-spin" />}
              <Icon size={10} />
              <span className="text-[10px] font-medium">{meta.label}</span>
            </div>
            {idx < STAGE_ORDER.length - 1 && (
              <div className={`h-px w-3 ${done ? "bg-white/20" : "bg-white/6"}`} />
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
        <Loader2 size={22} className="animate-spin text-white/20" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-400">
          {error instanceof Error ? error.message : "Job not found"}
        </p>
      </div>
    );
  }

  const isRunning = job.status === "queued" || job.status === "running";

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
  const allLogLines = job.log_lines ?? [];
  // Strip quantum-internal levels — show only biology events
  const bioLogLines = allLogLines.filter((l) => !QUANTUM_LEVELS.has(l.level));
  const metrics = extractLiveMetrics(bioLogLines);
  const stageMeta = metrics.currentStage ? STAGE_ICONS[metrics.currentStage] : null;
  const ActiveStageIcon = stageMeta?.icon ?? Activity;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={FlaskConical}
        label="Pharma"
        title={`${job.target_pdb_id} — ${job.mode.charAt(0).toUpperCase() + job.mode.slice(1)}`}
        description={jobId}
        glow="emerald"
      />

      <div className="flex flex-1 flex-col gap-4 p-6">
        {/* ── Top bar: status + controls ──────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-white/6 bg-white/[0.025] px-5 py-3">
          <span
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
              STATUS_COLORS[job.status] ?? "text-white/50",
            ].join(" ")}
          >
            {isRunning && <Loader2 size={10} className="animate-spin" />}
            <span className="capitalize">{job.status}</span>
          </span>

          <div className="h-4 w-px bg-white/8" />

          <span className="font-mono text-sm text-white/70">{job.target_pdb_id}</span>
          <span className="text-sm capitalize text-white/35">{job.mode}</span>

          {job.result && (
            <>
              <div className="h-4 w-px bg-white/8" />
              <span className="text-[11px] text-white/40">
                {job.result.candidates.length} candidates · {job.result.total_runtime_seconds.toFixed(1)}s · {job.result.iterations_used} iters
              </span>
            </>
          )}

          {job.completed_at && (
            <span className="ml-auto text-[11px] text-white/25">
              {new Date(job.completed_at).toLocaleString()}
            </span>
          )}

          {isRunning && (
            <button
              onClick={() => cancelJob()}
              disabled={isCancelling}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-red-400/25 bg-red-400/8 px-3 py-1.5 text-[11px] font-medium text-red-400 transition-colors hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCancelling ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />}
              {isCancelling ? "Cancelling…" : "Cancel Job"}
            </button>
          )}
        </div>

        {/* ── Error banner ────────────────────────────────────────────────── */}
        {job.error && (
          <div className="rounded-xl border border-red-400/20 bg-red-400/5 px-5 py-4">
            <p className="font-mono text-sm text-red-400">{job.error}</p>
          </div>
        )}

        {/* ── Live biology hero panel ──────────────────────────────────────── */}
        {(bioLogLines.length > 0 || isRunning) && (
          <div className="flex flex-col overflow-hidden rounded-xl border border-emerald-400/12 bg-[#080b0f]">

            {/* Hero header */}
            <div className="flex items-center gap-3 border-b border-white/5 bg-emerald-400/[0.04] px-5 py-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/10">
                <ActiveStageIcon size={14} className={stageMeta?.color ?? "text-emerald-400/60"} />
              </div>
              <div className="flex flex-col">
                <span className="text-[12px] font-semibold text-white/70">
                  Live Docking Pipeline
                </span>
                {metrics.currentStage && (
                  <span className={`text-[10px] font-medium ${stageMeta?.color ?? "text-emerald-400/60"}`}>
                    {stageMeta?.label ?? metrics.currentStage}
                  </span>
                )}
              </div>
              {isRunning && (
                <span className="ml-2 flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-medium text-emerald-400">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  live
                </span>
              )}
              <span className="ml-auto text-[10px] text-white/20">
                {bioLogLines.length} event{bioLogLines.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Live metrics strip */}
            <div className="grid grid-cols-2 divide-x divide-white/5 border-b border-white/5 sm:grid-cols-4">
              <div className="px-5 py-3">
                <p className="mb-1 text-[10px] uppercase tracking-wider text-white/25">Stage</p>
                <p className={`text-[13px] font-semibold ${stageMeta?.color ?? "text-white/50"}`}>
                  {stageMeta?.label ?? (metrics.currentStage ?? "—")}
                </p>
              </div>
              <div className="px-5 py-3">
                <p className="mb-1 text-[10px] uppercase tracking-wider text-white/25">Iterations</p>
                <p className="text-[13px] font-semibold text-violet-300">
                  {metrics.iterCount > 0 ? metrics.iterCount : "—"}
                </p>
              </div>
              <div className="px-5 py-3">
                <p className="mb-1 text-[10px] uppercase tracking-wider text-white/25">Best Dock Score</p>
                <p className="text-[13px] font-semibold text-rose-300">
                  {metrics.bestScore !== null ? metrics.bestScore.toFixed(2) : "—"}
                </p>
              </div>
              <div className="px-5 py-3">
                <p className="mb-1 text-[10px] uppercase tracking-wider text-white/25">ADMET Passes</p>
                <p className="text-[13px] font-semibold text-teal-300">
                  {metrics.candidatesFound > 0 ? metrics.candidatesFound : "—"}
                </p>
              </div>
            </div>

            {/* Stage progress strip */}
            {bioLogLines.length > 0 && (
              <div className="border-b border-white/5 px-5 py-2.5">
                <StageStrip logLines={bioLogLines} />
              </div>
            )}

            {/* Biology event feed */}
            <div
              ref={consoleRef}
              className="flex max-h-[560px] min-h-[200px] flex-col gap-0.5 overflow-y-auto p-3 font-mono"
            >
              {bioLogLines.length === 0 && isRunning ? (
                <div className="flex items-center gap-2 px-2 py-4 text-[11px] text-white/20">
                  <Loader2 size={11} className="animate-spin" />
                  Waiting for pipeline to start…
                </div>
              ) : (
                bioLogLines.map((entry, i) => <LogLine key={i} entry={entry} />)
              )}
            </div>

            {isRunning && (
              <div className="flex items-center gap-2 border-t border-white/5 px-5 py-2 text-[10px] text-white/20">
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
              <Star size={13} className="text-emerald-400/60" />
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/30">
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
