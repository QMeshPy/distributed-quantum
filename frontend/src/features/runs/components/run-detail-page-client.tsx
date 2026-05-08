"use client";
import { useParams, useRouter } from "next/navigation";
import {
  Cpu, Zap, BarChart3, Database, ArrowRight, CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/shared/components/layout/page-header";
import { cn } from "@/lib/utils";
import {
  GlassCard,
  SectionTitle,
  JobMetaStrip,
  MetricGrid,
  DataTable,
  type MetricItem,
  type DataTableColumn,
} from "@/shared/components/detail";
import { ROUTES } from "@/constants";
import { useRunDetail } from "../hooks/use-run-detail";
import { RunStatusBadge } from "./run-status-badge";
import type { RunDetail, FragmentResult } from "../types";

// ── helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number, d = 4) {
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── Quantum Details button ─────────────────────────────────────────────────────
function QuantumDetailsButton({ runId }: { runId: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(ROUTES.runFragmentFlow(runId))}
      className={cn(
        "group relative flex items-center gap-1.5 overflow-hidden rounded-md",
        "border border-violet-500/25 bg-violet-500/8 px-3 py-1.5",
        "text-[12px] font-medium text-violet-400 transition-all duration-200",
        "hover:border-violet-500/50 hover:bg-violet-500/15 hover:text-violet-300",
      )}
    >
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-violet-400/12 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      <Zap className="h-3 w-3 shrink-0 animate-pulse" />
      <span>Quantum Details</span>
      <ArrowRight className="h-3 w-3 shrink-0 opacity-60 transition-transform duration-150 group-hover:translate-x-0.5" />
    </button>
  );
}

// ── Fragment results table columns ─────────────────────────────────────────────
const fragmentCols: DataTableColumn<FragmentResult>[] = [
  {
    key: "fragmentId",
    header: "Fragment",
    align: "left",
    render: (r) => (
      <span className="font-mono text-[11px] text-white/60">{r.fragmentId.slice(0, 12)}…</span>
    ),
  },
  {
    key: "nodeId",
    header: "Node",
    align: "left",
    render: (r) => <span className="text-white/55 text-[12px]">{r.nodeId}</span>,
  },
  {
    key: "status",
    header: "Status",
    align: "left",
    render: (r) => {
      const isOk = r.status.toLowerCase() === "success" || r.status.toLowerCase() === "completed";
      const isErr = r.status.toLowerCase() === "failed";
      return (
        <div className="flex items-center gap-1.5">
          {isOk ? (
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
          ) : isErr ? (
            <XCircle className="h-3 w-3 text-red-400" />
          ) : (
            <Clock className="h-3 w-3 text-white/30" />
          )}
          <span className={cn("text-[12px]", isOk ? "text-emerald-400" : isErr ? "text-red-400" : "text-white/40")}>
            {r.status}
          </span>
        </div>
      );
    },
  },
  {
    key: "observedFidelity",
    header: "Fidelity",
    align: "right",
    render: (r) => r.observedFidelity !== null ? (
      <span className={cn("tabular-nums text-[12px]", r.observedFidelity >= 0.9 ? "text-emerald-400" : r.observedFidelity >= 0.7 ? "text-amber-400" : "text-red-400")}>
        {(r.observedFidelity * 100).toFixed(1)}%
      </span>
    ) : <span className="text-white/25">—</span>,
  },
  {
    key: "attempts",
    header: "Attempts",
    align: "right",
    render: (r) => <span className="tabular-nums text-white/50">{r.attempts}</span>,
  },
];

// ── Top states table ───────────────────────────────────────────────────────────
type TopStateRow = { state: string; probability: number; count: number | null };
const topStateCols: DataTableColumn<TopStateRow>[] = [
  {
    key: "state",
    header: "Basis State",
    align: "left",
    render: (r) => <span className="font-mono text-sm text-white/70">{r.state}</span>,
  },
  {
    key: "probability",
    header: "Probability",
    align: "right",
    accent: true,
    accentClass: "text-violet-300 tabular-nums",
    render: (r) => `${(r.probability * 100).toFixed(2)}%`,
  },
  {
    key: "count",
    header: "Shots",
    align: "right",
    render: (r) => r.count !== null ? (
      <span className="tabular-nums text-white/50">{r.count.toLocaleString()}</span>
    ) : <span className="text-white/20">—</span>,
  },
];

// ── Main panel ─────────────────────────────────────────────────────────────────
function RunDetailPanel({ run }: { run: RunDetail }) {
  const progress = run.progress;
  const qr = run.result?.quantumResult;
  const fragments = run.result?.fragmentResults ?? [];

  const completionPct = progress ? Math.round(progress.completionRatio * 100) : null;

  const successFragments = fragments.filter(f => f.status.toLowerCase() === "success" || f.status.toLowerCase() === "completed").length;
  const failedFragments = fragments.filter(f => f.status.toLowerCase() === "failed").length;
  const avgFidelity = fragments.length > 0
    ? fragments.reduce((s, f) => s + (f.observedFidelity ?? 0), 0) / fragments.filter(f => f.observedFidelity !== null).length
    : null;

  const executionMetrics: MetricItem[] = [
    { label: "Status", value: <RunStatusBadge status={run.status} /> },
    { label: "Total Fragments", value: (progress?.totalFragments ?? fragments.length).toLocaleString() },
    { label: "Completed", value: (progress?.completedFragments ?? successFragments).toLocaleString(), accent: true },
    { label: "Active", value: (progress?.activeFragments ?? 0).toLocaleString() },
    { label: "Success Rate", value: fragments.length > 0 ? `${((successFragments / fragments.length) * 100).toFixed(0)}%` : "—" },
    { label: "Avg Fidelity", value: avgFidelity !== null && !isNaN(avgFidelity) ? `${(avgFidelity * 100).toFixed(1)}%` : "—" },
    { label: "Shots", value: qr?.shots != null ? qr.shots.toLocaleString() : "—" },
    { label: "Plan ID", value: run.planId ? <span className="font-mono text-[11px]">{run.planId}</span> : "—" },
  ];

  const rawCounts = qr?.counts ?? null;
  const rawProbs = qr?.probabilities ?? null;

  const topStateRows: TopStateRow[] = (qr?.topBasisStates ?? []).slice(0, 10).map((s) => {
    const state = String(s.basis_state ?? s.state ?? s.basis ?? "");
    return {
      state,
      probability: typeof s.probability === "number" ? s.probability : 0,
      // top_basis_states doesn't include count — look it up from counts map
      count: rawCounts?.[state] ?? (typeof s.count === "number" ? s.count : null),
    };
  });
  const countRows: TopStateRow[] = topStateRows.length === 0
    ? (() => {
        if (rawCounts && Object.keys(rawCounts).length > 0) {
          const total = Object.values(rawCounts).reduce((a, b) => a + b, 0) || 1;
          return Object.entries(rawCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([state, count]) => ({ state, probability: count / total, count }));
        }
        if (rawProbs && Object.keys(rawProbs).length > 0) {
          return Object.entries(rawProbs)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([state, probability]) => ({ state, probability, count: null }));
        }
        return [];
      })()
    : [];

  const measurementRows = topStateRows.length > 0 ? topStateRows : countRows;

  return (
    <div className="flex flex-col gap-4">
      <JobMetaStrip
        jobId={run.jobId}
        status={run.status}
        createdAt={run.createdAt}
        extraBadges={[
          ...(run.planId ? [{ label: "Distributed", className: "border-violet-500/30 bg-violet-500/10 text-violet-400" }] : []),
          ...(failedFragments > 0 ? [{ label: `${failedFragments} failed`, className: "border-red-500/30 bg-red-500/10 text-red-400" }] : []),
        ]}
        rightContent={<QuantumDetailsButton runId={run.jobId} />}
      />

      {/* Execution overview */}
      <GlassCard>
        <SectionTitle
          icon={Cpu}
          title="Execution Overview"
          accentColor="violet"
          tooltip="Real-time status of the circuit execution job. Fragment completion tracks how many of the distributed circuit pieces have finished running on their assigned quantum nodes."
          badge={
            progress && completionPct !== null ? (
              <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-400 ring-1 ring-violet-500/20">
                {completionPct}% complete{progress.finalizing ? " · finalizing" : ""}
              </span>
            ) : undefined
          }
        />
        {progress && completionPct !== null && (
          <div className="mb-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-violet-500/60 transition-all duration-700"
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>
        )}
        <MetricGrid metrics={executionMetrics} accentClass="text-violet-300" />
      </GlassCard>

      {/* Fragment results */}
      {fragments.length > 0 && (
        <GlassCard>
          <SectionTitle
            icon={BarChart3}
            title="Fragment Execution Results"
            accentColor="violet"
            tooltip="Per-fragment execution outcomes. Each fragment is a sub-circuit sent to one quantum node. Fidelity measures how accurately the node executed the gates — values above 90% are considered high quality."
            badge={
              <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] text-white/40 ring-1 ring-white/8">
                {fragments.length} fragments
              </span>
            }
          />
          <DataTable
            rows={fragments}
            columns={fragmentCols}
            accentClass="text-violet-300"
            getRowKey={(r, i) => `${r.fragmentId ?? i}-${i}`}
          />
        </GlassCard>
      )}

      {/* Top measurement states */}
      {measurementRows.length > 0 && (
        <GlassCard>
          <SectionTitle icon={Database} title="Measurement Outcomes" accentColor="violet" tooltip="The most probable bitstrings observed when the circuit qubits were measured. Each bitstring represents a distinct quantum state; probabilities must sum to 1. High-probability states dominate the quantum result." />
          <DataTable
            rows={measurementRows}
            columns={topStateCols}
            accentClass="text-violet-300"
            getRowKey={(r, i) => `${r.state ?? i}-${i}`}
          />
        </GlassCard>
      )}

      {/* Circuit text */}
      {run.circuitText && (
        <GlassCard>
          <SectionTitle icon={Zap} title="Circuit" accentColor="violet" tooltip="The OpenQASM or Qiskit circuit text submitted for execution. This defines the exact sequence of quantum gates applied to each qubit before measurement." />
          <pre className="max-h-64 overflow-auto rounded-lg bg-white/[0.025] p-3 font-mono text-[11px] text-white/55 ring-1 ring-white/6">
            {run.circuitText}
          </pre>
        </GlassCard>
      )}

      {/* Error */}
      {run.error && (
        <GlassCard className="ring-red-500/20">
          <div className="flex items-start gap-2">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div>
              <p className="text-sm font-medium text-red-300">Execution Error</p>
              <p className="mt-1 text-[12px] text-white/50">{run.error}</p>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

export function RunDetailPageClient() {
  const { runId } = useParams<{ runId: string }>();
  const { data: run, isLoading, isError } = useRunDetail(runId);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={Cpu}
        label="Quantum Runs"
        title="Run Detail"
        description="Circuit execution progress, fragment results, and measurement outcomes."
        glow="violet"
      />
      <div className="relative flex-1 overflow-y-auto p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden" style={{ height: "280px" }}>
          <div
            className="absolute h-[240px] w-[300px] rounded-full opacity-12 blur-[90px]"
            style={{ left: "5%", top: "-40px", background: "radial-gradient(circle, rgba(167,139,250,0.35) 0%, transparent 70%)" }}
          />
          <div
            className="absolute h-[200px] w-[250px] rounded-full opacity-8 blur-[75px]"
            style={{ right: "10%", top: "-20px", background: "radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%)" }}
          />
        </div>

        <div className="relative z-10">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full rounded-2xl bg-white/5" />
              <Skeleton className="h-48 w-full rounded-2xl bg-white/5" />
              <Skeleton className="h-64 w-full rounded-2xl bg-white/5" />
            </div>
          ) : isError || !run ? (
            <div
              className="flex items-center gap-3 rounded-2xl px-5 py-4 ring-1 ring-red-500/20"
              style={{ background: "rgba(239,68,68,0.06)" }}
            >
              <p className="text-sm text-red-400">Failed to load run.</p>
            </div>
          ) : (
            <RunDetailPanel run={run} />
          )}
        </div>
      </div>
    </div>
  );
}
