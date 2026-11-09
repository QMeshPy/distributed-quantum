"use client";

import { Button } from "@/components/arc/button/button";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Ban,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Star,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { usePharmaJobLive } from "../hooks/use-pharma-job-live";
import { LigandViewer } from "./ligand-viewer";
import { CandidateCard } from "./candidate-card";
import { PharmaPeersDrawer } from "./pharma-peers-drawer";
import { LOG_META, STAGE_ICONS } from "../lib/pharma-stage-config";
import type { PharmaJob, PipelineLogEntry, PipelineLogLevel } from "../types";
import type { ScorePoint } from "../types-live";

const ProteinViewer = dynamic(
  () => import("./protein-viewer").then((m) => ({ default: m.ProteinViewer })),
  { ssr: false },
);

const STATUS_COLORS: Record<string, string> = {
  queued:    "text-warning bg-warning/10 border-warning/25",
  running:   "text-info bg-info/10 border-info/25",
  completed: "text-success bg-success/10 border-success/25",
  failed:    "text-danger bg-danger/10 border-danger/25",
  cancelled: "text-faint bg-surface-muted border-border",
};

const QUANTUM_LEVELS = new Set<PipelineLogLevel>(["vqe"]);

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

    // Extract the current candidate SMILES from the Stage 3 fragmenting log
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

    if (line.level === "admet" && line.message.toLowerCase().includes("pass")) {
      admetPasses++;
    }
  }

  return { currentStage, iterCount, maxIter, bestScore, bestSmiles, currentCandidateSmiles, scoreHistory, admetPasses };
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <motion.div
      key={value}
      initial={{ scale: 1 }}
      animate={{ scale: [1, 1.07, 1] }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex flex-col px-4 py-2.5"
    >
      <p className="mb-0.5 text-xs text-faint">{label}</p>
      <p className={`text-sm font-medium ${color}`}>{value}</p>
    </motion.div>
  );
}

function LiveLogRow({ entry }: { entry: PipelineLogEntry }) {
  const meta = LOG_META[entry.level] ?? LOG_META.info;
  const Icon = meta.icon;
  const time = new Date(entry.ts).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const displayMsg = entry.level === "score"
    ? entry.message.replace(/\s*SMILES:\S+/, "").trim()
    : entry.message;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`flex items-start gap-2 rounded px-2.5 py-1.5 ${meta.bg}`}
    >
      <span className="mt-px shrink-0 font-mono text-xs text-faint">{time}</span>
      <span className={`mt-px flex h-[16px] w-[40px] shrink-0 items-center justify-center rounded text-xs font-medium ${meta.color} bg-surface-muted`}>
        {meta.label}
      </span>
      <Icon size={10} className={`mt-0.5 shrink-0 ${meta.color} opacity-60`} />
      <span className={`font-mono text-xs leading-relaxed ${meta.color}`}>{displayMsg}</span>
    </motion.div>
  );
}

function IterProgress({ current, max }: { current: number; max: number }) {
  const pct = Math.min((current / max) * 100, 100);
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-2">
      <span className="shrink-0 text-xs font-medium text-accent">
        Iter {current}/{max}
      </span>
      <div className="flex-1 overflow-hidden rounded-full bg-surface-muted h-1">
        <motion.div
          className="h-full rounded-full bg-accent"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
      <span className="shrink-0 font-mono text-xs text-faint">{pct.toFixed(0)}%</span>
    </div>
  );
}

export function PharmaLiveCanvas({ job, onCancel, isCancelling }: Props) {
  const { job_id: jobId, target_pdb_id: targetPdbId, mode, status } = job;
  const isRunning   = status === "queued" || status === "running";
  const isCompleted = status === "completed";

  const { data: liveData } = usePharmaJobLive(jobId, isRunning);

  const allLogLines = job.log_lines ?? [];
  const bioLogLines = allLogLines.filter((l) => !QUANTUM_LEVELS.has(l.level));
  const derived     = deriveMetricsFromLogs(allLogLines);

  const effectiveStage   = liveData?.current_stage   ?? derived.currentStage;
  const effectiveIter    = liveData?.iteration_count ?? derived.iterCount;
  const effectiveScore   = isCompleted
    ? (job.result?.candidates[0]?.vqc_score?.binding_affinity_kcal ?? liveData?.best_score ?? derived.bestScore)
    : (liveData?.best_score ?? derived.bestScore);
  const effectiveAdmet   = liveData?.admet_passes ?? derived.admetPasses;
  const effectiveHistory = (liveData?.score_history?.length ?? 0) > 0
    ? liveData!.score_history
    : derived.scoreHistory;
  const effectiveSmiles  = isCompleted
    ? (job.result?.candidates[0]?.smiles ?? liveData?.best_smiles ?? derived.bestSmiles ?? derived.currentCandidateSmiles)
    : (liveData?.best_smiles ?? derived.bestSmiles ?? derived.currentCandidateSmiles);

  const stageRef      = useRef<any>(null);
  const prevSmilesRef = useRef<string | null>(null);
  const prevScoreRef  = useRef<number | null>(null);
  const prevStageRef  = useRef<string | null>(null);
  const logScrollRef  = useRef<HTMLDivElement>(null);
  const [discoveredSmiles, setDiscoveredSmiles] = useState<string[]>([]);
  const discoveredScrollRef = useRef<HTMLDivElement>(null);

  // Elapsed-time timer (ticks every second while running)
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  useEffect(() => {
    if (!isRunning) return;
    const start = new Date(job.submitted_at).getTime();
    const tick = () => setElapsedSec(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isRunning, job.submitted_at]);

  const elapsedDisplay = (() => {
    const h = Math.floor(elapsedSec / 3600);
    const m = Math.floor((elapsedSec % 3600) / 60);
    const s = elapsedSec % 60;
    return h > 0
      ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  })();

  // NGL: swap ligand when best smiles changes
  useEffect(() => {
    const stage = stageRef.current;
    const smiles = effectiveSmiles;
    if (!stage || !smiles || smiles === prevSmilesRef.current) return;
    prevSmilesRef.current = smiles;
    stage.compList
      .filter((c: any) => c.name === "live-ligand")
      .forEach((c: any) => stage.removeComponent(c));
    stage
      .loadFile(`smiles://${smiles}`, { name: "live-ligand" })
      .then((comp: any) => {
        if (!comp) return;
        comp.addRepresentation("ball+stick", { colorScheme: "element", quality: "high" });
        comp.autoView(400);
      })
      .catch(() => {});
  }, [effectiveSmiles]);

  // NGL: pocket pulse on new best score
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || effectiveScore === null || effectiveScore === prevScoreRef.current) return;
    prevScoreRef.current = effectiveScore;
    stage.compList.forEach((comp: any) => {
      comp.reprList
        .filter((r: any) => r.type === "surface")
        .forEach((r: any) => {
          r.setParameters({ opacity: 0.5 });
          setTimeout(() => r.setParameters({ opacity: 0.18 }), 700);
        });
    });
  }, [effectiveScore]);

  // NGL: camera refocus on stage change
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !effectiveStage || effectiveStage === prevStageRef.current) return;
    prevStageRef.current = effectiveStage;
    stage.autoView(800);
  }, [effectiveStage]);

  // Auto-scroll log to bottom on new events
  useEffect(() => {
    const el = logScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bioLogLines.length]);

  // Accumulate discovered SMILES on ADMET pass
  useEffect(() => {
    const smiles = effectiveSmiles;
    if (!smiles || effectiveAdmet === 0) return;
    setDiscoveredSmiles((prev) => {
      if (prev.includes(smiles)) return prev;
      return [...prev, smiles].slice(-20);
    });
  }, [effectiveAdmet, effectiveSmiles]);

  // On completion, add final candidates
  useEffect(() => {
    if (!isCompleted || !job.result) return;
    setDiscoveredSmiles((prev) => {
      const fresh = job.result!.candidates.map((c) => c.smiles).filter((s) => !prev.includes(s));
      return [...prev, ...fresh].slice(-20);
    });
  }, [isCompleted, job.result]);

  useEffect(() => {
    const el = discoveredScrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [discoveredSmiles.length]);

  const stageMeta       = effectiveStage ? STAGE_ICONS[effectiveStage] : null;
  const ActiveStageIcon = isCompleted ? CheckCircle2 : (stageMeta?.icon ?? Activity);
  const stageColor      = isCompleted ? "text-success" : (stageMeta?.color ?? "text-faint");
  const maxIter         = derived.maxIter;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">

      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface-muted px-5 py-2.5">
        <FlaskConical size={14} className="text-success" />
        <span className="text-sm font-medium text-foreground">
          {targetPdbId}, <span className="capitalize">{mode}</span>
        </span>
        <span className={["inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_COLORS[status] ?? "text-subtle"].join(" ")}>
          {isRunning   && <Loader2    size={9} className="animate-spin" />}
          {isCompleted && <CheckCircle2 size={9} />}
          <span className="capitalize">{status}</span>
        </span>
        {isRunning && (
          <span className="flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            live
          </span>
        )}
        <span className="font-mono text-xs text-faint">{jobId}</span>
        <div className="ml-auto">
          <PharmaPeersDrawer job={job} liveData={liveData} isRunning={isRunning} />
        </div>
        {isRunning && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-3 py-1.5 font-mono text-xs tabular-nums text-subtle">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-foreground/30 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-foreground/30" />
              </span>
              {elapsedDisplay}
            </span>
            <Button variant="danger" size="sm" onClick={onCancel} disabled={isCancelling}>
              {isCancelling ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />}
              {isCancelling ? "Cancelling…" : "Cancel"}
            </Button>
          </div>
        )}
      </div>

      {/* Main split */}
      <div className="flex min-h-0 flex-1 divide-x divide-border overflow-hidden">

        {/* LEFT: 3D protein viewer */}
        <div className="relative flex w-[45%] flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
            <ActiveStageIcon size={12} className={stageColor} />
            <span className={`text-xs font-medium ${stageColor}`}>
              {isCompleted ? "Completed" : (stageMeta?.label ?? "Protein Structure")}
            </span>
            <span className="ml-auto font-mono text-xs text-faint">{targetPdbId.toUpperCase()}</span>
          </div>
          <div className="min-h-0 flex-1">
            <ProteinViewer pdbId={targetPdbId} onStageReady={(stage) => { stageRef.current = stage; }} />
          </div>
          {/* Live stage / score overlay on the 3D canvas */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 border-t border-border bg-background/85 px-4 py-2.5">
            {isRunning ? (
              <>
                <Loader2 size={10} className="animate-spin text-success" />
                <span className={`text-xs font-medium ${stageColor}`}>
                  {stageMeta?.label ?? "Initialising…"}
                </span>
                {maxIter > 0 && (
                  <span className="text-xs text-faint">iter {effectiveIter}/{maxIter}</span>
                )}
                {effectiveScore !== null && (
                  <span className="ml-auto font-mono text-xs font-medium text-danger">
                    {effectiveScore.toFixed(2)} kcal/mol
                  </span>
                )}
              </>
            ) : isCompleted ? (
              <>
                <CheckCircle2 size={10} className="text-success" />
                <span className="text-xs font-medium text-success">Pipeline complete</span>
                {effectiveScore !== null && (
                  <span className="ml-auto font-mono text-xs font-medium text-danger">
                    best {effectiveScore.toFixed(2)} kcal/mol
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs text-faint">No active pipeline</span>
            )}
          </div>
        </div>

        {/* RIGHT: dashboard + live log */}
        <div className="flex w-[55%] flex-col overflow-hidden">

          {/* Stat cards */}
          <div className="grid shrink-0 grid-cols-4 divide-x divide-border border-b border-border">
            <StatCard label="Stage" value={isCompleted ? "Done" : (stageMeta?.label ?? (effectiveStage ?? "-"))} color={isCompleted ? "text-success" : (stageMeta?.color ?? "text-subtle")} />
            <StatCard label="Iteration" value={effectiveIter > 0 ? (maxIter > 0 ? `${effectiveIter}/${maxIter}` : String(effectiveIter)) : "-"} color="text-accent" />
            <StatCard label="Best Score" value={effectiveScore != null ? `${effectiveScore.toFixed(2)}` : "-"} color="text-danger" />
            <StatCard label="ADMET Pass" value={effectiveAdmet > 0 ? String(effectiveAdmet) : "-"} color="text-success" />
          </div>

          {/* Iteration progress bar */}
          {maxIter > 0 && <IterProgress current={effectiveIter} max={maxIter} />}

          {/* Live biology event feed */}
          <div className="flex min-h-0 flex-1 flex-col border-b border-border">
            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-muted px-4 py-1.5">
              <span className="text-xs font-medium text-faint">Live Biology Feed</span>
              <span className="ml-auto text-xs text-faint">
                {isRunning && <Loader2 size={8} className="inline animate-spin mr-1" />}
                {bioLogLines.length} event{bioLogLines.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div ref={logScrollRef} className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
              {bioLogLines.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-xs text-faint">
                  {isRunning ? (
                    <span className="flex items-center gap-2"><Loader2 size={11} className="animate-spin" />Waiting for pipeline to start…</span>
                  ) : "No events"}
                </div>
              ) : (
                <AnimatePresence>
                  {bioLogLines.map((entry, i) => (
                    <LiveLogRow key={`${entry.ts}-${i}`} entry={entry} />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* Score chart + best ligand side-by-side */}
          <div className="flex shrink-0 divide-x divide-border border-b border-border" style={{ height: 180 }}>
            <div className="flex min-w-0 flex-1 flex-col px-3 py-2">
              <p className="mb-1 shrink-0 text-xs text-faint">Score / Iter</p>
              {effectiveHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={effectiveHistory} margin={{ top: 2, right: 4, bottom: 0, left: -22 }}>
                    <XAxis dataKey="iteration" tick={{ fontSize: 12, fill: "color-mix(in oklab, var(--foreground) 18%, transparent)" }} axisLine={false} tickLine={false} />
                    <YAxis reversed tick={{ fontSize: 12, fill: "color-mix(in oklab, var(--foreground) 18%, transparent)" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "var(--background)", border: "1px solid color-mix(in oklab, var(--foreground) 8%, transparent)", borderRadius: 6, fontSize: 10, color: "color-mix(in oklab, var(--foreground) 70%, transparent)" }} formatter={(v: unknown) => [`${(v as number).toFixed(2)} kcal/mol`, "Score"]} labelFormatter={(l: unknown) => `Iter ${l}`} />
                    <Line type="monotone" dataKey="score" stroke="var(--danger)" strokeWidth={1.5} dot={{ r: 2, fill: "var(--danger)" }} activeDot={{ r: 3 }} isAnimationActive />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-1 items-center justify-center text-xs text-faint">
                  {isRunning ? <span className="flex items-center gap-1.5"><Loader2 size={9} className="animate-spin" />waiting…</span> : "-"}
                </div>
              )}
            </div>
            <div className="flex w-[140px] shrink-0 flex-col items-center px-3 py-2">
              <p className="mb-1 shrink-0 self-start text-xs text-faint">
                {effectiveScore != null ? "Best Ligand" : "Current Candidate"}
              </p>
              {effectiveSmiles ? (
                <LigandViewer smiles={effectiveSmiles} width={120} height={130} />
              ) : (
                <div className="flex flex-1 items-center justify-center text-xs text-faint">
                  {isRunning ? <Loader2 size={10} className="animate-spin" /> : "-"}
                </div>
              )}
            </div>
          </div>

          {/* Discovered SMILES strip */}
          {discoveredSmiles.length > 0 && (
            <div className="shrink-0 border-b border-border px-4 py-2">
              <p className="mb-1.5 text-xs text-faint">Discovered ({discoveredSmiles.length})</p>
              <div ref={discoveredScrollRef} className="flex gap-2 overflow-x-auto pb-1">
                <AnimatePresence initial={false}>
                  {discoveredSmiles.map((smiles) => (
                    <motion.div key={smiles} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }} className="shrink-0">
                      <LigandViewer smiles={smiles} width={80} height={65} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Completed: candidate cards */}
          {isCompleted && job.result && job.result.candidates.length > 0 && (
            <div className="overflow-y-auto px-4 py-4">
              <div className="mb-3 flex items-center gap-2">
                <Star size={12} className="text-success" />
                <p className="text-xs font-medium text-faint">
                  Top Candidates ({job.result.candidates.length})
                </p>
                <span className="ml-auto text-xs text-faint">
                  {job.result.total_runtime_seconds.toFixed(1)}s · {job.result.iterations_used} iters
                </span>
              </div>
              <div className="space-y-4">
                {job.result.candidates.map((c) => (
                  <CandidateCard key={c.rank} candidate={c} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
