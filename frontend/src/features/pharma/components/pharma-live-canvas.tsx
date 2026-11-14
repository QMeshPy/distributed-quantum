"use client";

import { PublishToNearButton } from "@/features/agentkit";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Ban, Check, CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "motion/react";
import { usePharmaJobLive } from "../hooks/use-pharma-job-live";
import { LigandViewer } from "./ligand-viewer";
import { CandidateCard } from "./candidate-card";
import { PharmaPeersDrawer } from "./pharma-peers-drawer";
import { LOG_META, STAGE_ICONS, STAGE_ORDER } from "../lib/pharma-stage-config";
import type { PharmaJob, PipelineLogEntry, PipelineLogLevel } from "../types";
import type { ScorePoint } from "../types-live";

const ProteinViewer = dynamic(
  () => import("./protein-viewer").then((m) => ({ default: m.ProteinViewer })),
  { ssr: false },
);

const STATUS_STYLE: Record<string, string> = {
  queued: "bg-amber-400/10 text-amber-300",
  running: "bg-sky-400/10 text-sky-300",
  completed: "bg-emerald-400/10 text-emerald-300",
  failed: "bg-rose-400/10 text-rose-300",
  cancelled: "bg-white/5 text-white/40",
};

const QUANTUM_LEVELS = new Set<PipelineLogLevel>(["vqe"]);
const PIPELINE = STAGE_ORDER.filter((s) => s !== "completed");

interface Props {
  job: PharmaJob;
  onCancel: () => void;
  isCancelling: boolean;
}

interface DerivedMetrics {
  currentStage: string | null;
  iterCount: number;
  maxIter: number;
  bestScore: number | null;
  bestSmiles: string | null;
  currentCandidateSmiles: string | null;
  scoreHistory: ScorePoint[];
  admetPasses: number;
}

function deriveMetricsFromLogs(logLines: PipelineLogEntry[]): DerivedMetrics {
  let currentStage: string | null = null;
  let iterCount = 0;
  let maxIter = 0;
  let bestScore: number | null = null;
  let bestSmiles: string | null = null;
  let currentCandidateSmiles: string | null = null;
  const scoreHistory: ScorePoint[] = [];
  let admetPasses = 0;

  for (const line of logLines) {
    if (QUANTUM_LEVELS.has(line.level)) continue;
    if (line.stage) currentStage = line.stage;

    if (line.level === "iter") {
      iterCount++;
      const m = line.message.match(/Iteration \d+\/(\d+)/);
      if (m) maxIter = Math.max(maxIter, parseInt(m[1], 10));
    }
    if (line.level === "stage" && line.message.includes("fragment decomposition:")) {
      const m = line.message.match(/fragment decomposition:\s*(\S+)/);
      if (m) currentCandidateSmiles = m[1];
    }
    if (line.level === "score") {
      const scoreM = line.message.match(/([-\d.]+)\s*kcal/);
      const smilesM = line.message.match(/SMILES:(\S+)/);
      if (scoreM) {
        const v = parseFloat(scoreM[1]);
        if (bestScore === null || v < bestScore) {
          bestScore = v;
          if (smilesM) bestSmiles = smilesM[1];
        }
        scoreHistory.push({ iteration: iterCount, score: v, ts: line.ts });
      }
    }
    if (line.level === "admet" && line.message.toLowerCase().includes("pass")) admetPasses++;
  }

  return { currentStage, iterCount, maxIter, bestScore, bestSmiles, currentCandidateSmiles, scoreHistory, admetPasses };
}

// Backend timestamps are UTC but may lack a zone suffix; without one JS parses them as local time.
function parseUtc(ts: string): number {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts}Z`).getTime();
}

function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col rounded-xl border border-white/[0.07] bg-white/[0.02] ${className}`}>
      <header className="flex items-center gap-2 px-4 pb-2 pt-3.5">
        <h3 className="text-[12px] font-medium text-white/70">{title}</h3>
        {aside && <div className="ml-auto text-[11px] text-white/35">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

function Kpi({ label, value, unit, sub, tone = "text-white" }: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
      <p className="text-[11px] text-white/40">{label}</p>
      <motion.p
        key={value}
        initial={{ opacity: 0.4 }}
        animate={{ opacity: 1 }}
        className={`mt-1 font-mono text-[22px] font-semibold leading-tight tabular-nums ${tone}`}
      >
        {value}
        {unit && <span className="ml-1 text-[12px] font-normal text-white/35">{unit}</span>}
      </motion.p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-white/30">{sub}</p>}
    </div>
  );
}

function PipelineStepper({ stage, done, iter, maxIter }: {
  stage: string | null;
  done: boolean;
  iter: number;
  maxIter: number;
}) {
  const current = stage ? PIPELINE.indexOf(stage) : -1;
  const pct = maxIter > 0 ? Math.min((iter / maxIter) * 100, 100) : done ? 100 : 0;
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
      <ol className="flex items-center gap-1 overflow-x-auto" aria-label="Pipeline stages">
        {PIPELINE.map((key, i) => {
          const meta = STAGE_ICONS[key];
          const state = done || i < current ? "done" : i === current ? "active" : "todo";
          return (
            <li key={key} className="flex shrink-0 items-center gap-1.5 sm:min-w-0 sm:flex-1 sm:shrink" aria-current={state === "active" ? "step" : undefined}>
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  state === "done"
                    ? "bg-emerald-400/15 text-emerald-300"
                    : state === "active"
                      ? "bg-sky-400/20 text-sky-200 ring-1 ring-sky-300/40"
                      : "bg-white/[0.05] text-white/30"
                }`}
              >
                {state === "done" ? <Check size={11} aria-hidden /> : state === "active" ? <Loader2 size={11} className="animate-spin" aria-hidden /> : i + 1}
              </span>
              <span className={`whitespace-nowrap text-[11px] sm:truncate ${state === "todo" ? "text-white/30" : "text-white/75"}`}>
                {meta?.label ?? key}
              </span>
              {i < PIPELINE.length - 1 && (
                <span className={`mx-1 hidden h-px flex-1 sm:block ${state === "done" ? "bg-emerald-400/30" : "bg-white/[0.08]"}`} />
              )}
            </li>
          );
        })}
      </ol>
      {maxIter > 0 && (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400"
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-white/40">
            iteration {iter}/{maxIter}
          </span>
        </div>
      )}
    </div>
  );
}

function LogRow({ entry }: { entry: PipelineLogEntry }) {
  const meta = LOG_META[entry.level] ?? LOG_META.info;
  const time = new Date(parseUtc(entry.ts)).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const message = entry.level === "score" ? entry.message.replace(/\s*SMILES:\S+/, "").trim() : entry.message;
  return (
    <li className="grid grid-cols-[4.5rem_3.25rem_1fr] items-baseline gap-2 px-4 py-1 font-mono text-[11px] hover:bg-white/[0.02]">
      <span className="text-white/25">{time}</span>
      <span className={`text-[10px] font-semibold ${meta.color}`}>{meta.label}</span>
      <span className="min-w-0 break-words text-white/60">{message}</span>
    </li>
  );
}

export function PharmaLiveCanvas({ job, onCancel, isCancelling }: Props) {
  const { job_id: jobId, target_pdb_id: targetPdbId, mode, status } = job;
  const isRunning = status === "queued" || status === "running";
  const isCompleted = status === "completed";

  const { data: liveData } = usePharmaJobLive(jobId, isRunning);

  const allLogLines = job.log_lines ?? [];
  const bioLogLines = allLogLines.filter((l) => !QUANTUM_LEVELS.has(l.level));
  const derived = deriveMetricsFromLogs(allLogLines);
  const topCandidate = job.result?.candidates[0];

  const effectiveStage = liveData?.current_stage ?? derived.currentStage;
  const effectiveIter = liveData?.iteration_count ?? derived.iterCount;
  const effectiveScore = isCompleted
    ? (topCandidate?.vqc_score?.binding_affinity_kcal ?? liveData?.best_score ?? derived.bestScore)
    : (liveData?.best_score ?? derived.bestScore);
  const effectiveAdmet = liveData?.admet_passes ?? derived.admetPasses;
  const effectiveHistory = (liveData?.score_history?.length ?? 0) > 0 ? liveData!.score_history : derived.scoreHistory;
  const effectiveSmiles = isCompleted
    ? (topCandidate?.smiles ?? liveData?.best_smiles ?? derived.bestSmiles ?? derived.currentCandidateSmiles)
    : (liveData?.best_smiles ?? derived.bestSmiles ?? derived.currentCandidateSmiles);
  const maxIter = derived.maxIter;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- NGL ships no types
  const stageRef = useRef<any>(null);
  const prevSmilesRef = useRef<string | null>(null);
  const prevScoreRef = useRef<number | null>(null);
  const prevStageRef = useRef<string | null>(null);
  const logScrollRef = useRef<HTMLDivElement>(null);
  const [discoveredSmiles, setDiscoveredSmiles] = useState<string[]>([]);
  const [logOpen, setLogOpen] = useState(isRunning);

  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (!isRunning) return;
    const start = parseUtc(job.submitted_at);
    const tick = () => setElapsedSec(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isRunning, job.submitted_at]);

  // NGL: dock the current best ligand into the protein scene
  useEffect(() => {
    const stage = stageRef.current;
    const smiles = effectiveSmiles;
    if (!stage || !smiles || smiles === prevSmilesRef.current) return;
    prevSmilesRef.current = smiles;
    stage.compList
      .filter((c: { name: string }) => c.name === "live-ligand")
      .forEach((c: unknown) => stage.removeComponent(c));
    stage
      .loadFile(`smiles://${smiles}`, { name: "live-ligand" })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((comp: any) => {
        if (!comp) return;
        comp.addRepresentation("ball+stick", { colorScheme: "element", quality: "high" });
        comp.autoView(400);
      })
      .catch(() => {});
  }, [effectiveSmiles]);

  // NGL: pulse the pocket surface on a new best score
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || effectiveScore === null || effectiveScore === prevScoreRef.current) return;
    prevScoreRef.current = effectiveScore;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stage.compList.forEach((comp: any) => {
      comp.reprList
        .filter((r: { type: string }) => r.type === "surface")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .forEach((r: any) => {
          r.setParameters({ opacity: 0.5 });
          setTimeout(() => r.setParameters({ opacity: 0.18 }), 700);
        });
    });
  }, [effectiveScore]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !effectiveStage || effectiveStage === prevStageRef.current) return;
    prevStageRef.current = effectiveStage;
    stage.autoView(800);
  }, [effectiveStage]);

  useEffect(() => {
    const el = logScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bioLogLines.length, logOpen]);

  // Remember each ligand that passed ADMET (state adjusted during render, not in an effect).
  if (effectiveSmiles && effectiveAdmet > 0 && !discoveredSmiles.includes(effectiveSmiles)) {
    setDiscoveredSmiles([...discoveredSmiles, effectiveSmiles].slice(-12));
  }

  const stageMeta = effectiveStage ? STAGE_ICONS[effectiveStage] : null;
  const runtime = isCompleted && job.result ? job.result.total_runtime_seconds : elapsedSec;
  const candidates = job.result?.candidates ?? [];

  return (
    <div className="h-full overflow-y-auto bg-[#07090d]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#07090d]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] text-white/35">Drug discovery · <span className="capitalize">{mode}</span></p>
            <div className="flex items-center gap-2.5">
              <h1 className="font-mono text-[20px] font-semibold tracking-tight text-white">{targetPdbId.toUpperCase()}</h1>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[status] ?? "text-white/50"}`}>
                {isRunning && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
                {isCompleted && <CheckCircle2 size={11} aria-hidden />}
                <span className="capitalize">{status}</span>
              </span>
            </div>
            <p className="mt-0.5 truncate font-mono text-[10px] text-white/25" title={jobId}>{jobId}</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <PharmaPeersDrawer job={job} liveData={liveData} isRunning={isRunning} />
            {isCompleted && <PublishToNearButton jobId={jobId} />}
            {isRunning && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isCancelling}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium text-rose-300 ring-1 ring-rose-400/30 transition-colors hover:bg-rose-400/10 disabled:opacity-50"
              >
                {isCancelling ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                {isCancelling ? "Cancelling…" : "Cancel"}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] space-y-4 px-4 py-5 sm:px-6">
        <PipelineStepper stage={effectiveStage} done={isCompleted} iter={effectiveIter} maxIter={maxIter} />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Best binding affinity"
            value={effectiveScore != null ? effectiveScore.toFixed(2) : "—"}
            unit={effectiveScore != null ? "kcal/mol" : undefined}
            sub="lower is stronger"
            tone="text-emerald-300"
          />
          <Kpi
            label="Iterations"
            value={effectiveIter > 0 ? String(effectiveIter) : "—"}
            unit={maxIter > 0 ? `/ ${maxIter}` : undefined}
            sub={isCompleted ? undefined : (stageMeta?.label ?? "Starting")}
          />
          <Kpi
            label="Candidates"
            value={isCompleted ? String(candidates.length) : effectiveAdmet > 0 ? String(effectiveAdmet) : "—"}
            sub={isCompleted ? `${candidates.filter((c) => c.admet.passes).length} pass ADMET` : "passed ADMET so far"}
          />
          <Kpi
            label={isCompleted ? "Runtime" : "Elapsed"}
            value={runtime > 0 ? formatDuration(runtime) : "—"}
            sub={job.result ? `${Math.round(job.result.cache_hit_rate * 100)}% VQE cache hits` : undefined}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <ProteinViewer pdbId={targetPdbId} height={460} onStageReady={(stage) => { stageRef.current = stage; }} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1">
            <Panel title={isCompleted ? "Best ligand" : "Current best ligand"}>
              <div className="flex flex-1 items-center justify-center px-4 pb-4">
                {effectiveSmiles ? (
                  <LigandViewer smiles={effectiveSmiles} width={260} height={150} />
                ) : (
                  <p className="py-12 text-[12px] text-white/30">
                    {isRunning ? "Waiting for the first scored ligand…" : "No ligand"}
                  </p>
                )}
              </div>
              {isRunning && discoveredSmiles.length > 1 && (
                <div className="flex gap-2 overflow-x-auto border-t border-white/[0.06] px-4 py-2.5">
                  {discoveredSmiles.slice(0, -1).reverse().map((s) => (
                    <div key={s} className="shrink-0 rounded-md bg-white/[0.03]" title={s}>
                      <LigandViewer smiles={s} width={72} height={56} />
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Score convergence" aside="kcal/mol per iteration">
              <div className="h-[170px] px-2 pb-3">
                {effectiveHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={effectiveHistory} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                      <defs>
                        <linearGradient id="pharma-score" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34d399" stopOpacity={0} />
                          <stop offset="100%" stopColor="#34d399" stopOpacity={0.25} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="iteration" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.35)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.35)" }} axisLine={false} tickLine={false} domain={["auto", "auto"]} width={44} />
                      <Tooltip
                        contentStyle={{ background: "#0d1017", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 11 }}
                        labelStyle={{ color: "rgba(255,255,255,0.5)" }}
                        formatter={(v: unknown) => [`${(v as number).toFixed(2)} kcal/mol`, "Score"]}
                        labelFormatter={(l: unknown) => `Iteration ${l}`}
                      />
                      <Area type="monotone" dataKey="score" stroke="#34d399" strokeWidth={2} fill="url(#pharma-score)" baseValue="dataMax" dot={{ r: 2.5, fill: "#34d399", strokeWidth: 0 }} activeDot={{ r: 4 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-[12px] text-white/30">
                    {isRunning ? "Scores appear after the first docking round" : "No scores recorded"}
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </div>

        {candidates.length > 0 && (
          <section className="space-y-3 pt-2">
            <div className="flex items-baseline gap-3">
              <h2 className="text-[15px] font-semibold text-white">Top candidates</h2>
              <span className="text-[12px] text-white/35">
                {candidates.length} ranked by binding affinity · {job.result!.iterations_used} iterations
              </span>
            </div>
            <div className="space-y-3">
              {candidates.map((c) => (
                <CandidateCard key={c.rank} candidate={c} />
              ))}
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
          <button
            type="button"
            onClick={() => setLogOpen((o) => !o)}
            aria-expanded={logOpen}
            className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-white/[0.02]"
          >
            <h3 className="text-[12px] font-medium text-white/70">Pipeline log</h3>
            {isRunning && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300" aria-hidden />}
            <span className="ml-auto text-[11px] text-white/35">
              {bioLogLines.length} event{bioLogLines.length === 1 ? "" : "s"}
            </span>
            <ChevronDown size={14} className={`text-white/40 transition-transform ${logOpen ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {logOpen && (
            <div ref={logScrollRef} className="max-h-[320px] overflow-y-auto border-t border-white/[0.06] py-2">
              {bioLogLines.length === 0 ? (
                <p className="flex items-center gap-2 px-4 py-6 text-[12px] text-white/30">
                  {isRunning && <Loader2 size={12} className="animate-spin" />}
                  {isRunning ? "Waiting for the pipeline to start…" : "No events"}
                </p>
              ) : (
                <ol>
                  {bioLogLines.map((entry, i) => (
                    <LogRow key={`${entry.ts}-${i}`} entry={entry} />
                  ))}
                </ol>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
