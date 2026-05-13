"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Ban,
  FlaskConical,
  Loader2,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { usePharmaJobLive } from "../hooks/use-pharma-job-live";
import { LigandViewer } from "./ligand-viewer";
import { STAGE_ICONS } from "../lib/pharma-stage-config";
import type { PharmaJobStatus, PharmaMode } from "../types";

// NGL viewer — SSR-guarded
const ProteinViewer = dynamic(
  () => import("./protein-viewer").then((m) => ({ default: m.ProteinViewer })),
  { ssr: false },
);

const STATUS_COLORS: Record<string, string> = {
  queued:    "text-amber-400 bg-amber-400/10 border-amber-400/25",
  running:   "text-sky-400 bg-sky-400/10 border-sky-400/25",
  completed: "text-emerald-400 bg-emerald-400/10 border-emerald-400/25",
  failed:    "text-red-400 bg-red-400/10 border-red-400/25",
  cancelled: "text-white/30 bg-white/5 border-white/10",
};

interface Props {
  jobId: string;
  targetPdbId: string;
  mode: PharmaMode;
  status: PharmaJobStatus;
  onCancel: () => void;
  isCancelling: boolean;
}

// Animated stat card — pulses when value changes
function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <motion.div
      key={value}
      initial={{ scale: 1 }}
      animate={{ scale: [1, 1.06, 1] }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex flex-col px-5 py-3"
    >
      <p className="mb-1 text-[10px] uppercase tracking-wider text-white/25">{label}</p>
      <p className={`text-[15px] font-semibold ${color}`}>{value}</p>
    </motion.div>
  );
}

export function PharmaLiveCanvas({
  jobId,
  targetPdbId,
  mode,
  status,
  onCancel,
  isCancelling,
}: Props) {
  const isRunning = status === "queued" || status === "running";
  const { data: liveData } = usePharmaJobLive(jobId, isRunning);

  // NGL stage handle — obtained via onStageReady callback from ProteinViewer
  const stageRef = useRef<any>(null);
  // Track previous best_smiles/score to detect changes
  const prevSmilesRef = useRef<string | null>(null);
  const prevScoreRef = useRef<number | null>(null);
  const prevStageRef = useRef<string | null>(null);
  // Accumulated discovered SMILES (ADMET passes)
  const [discoveredSmiles, setDiscoveredSmiles] = useState<string[]>([]);
  const discoveredScrollRef = useRef<HTMLDivElement>(null);

  // Load / swap best ligand in NGL when best_smiles changes
  useEffect(() => {
    const stage = stageRef.current;
    const smiles = liveData?.best_smiles ?? null;
    if (!stage || !smiles || smiles === prevSmilesRef.current) return;
    prevSmilesRef.current = smiles;

    // Remove any existing ligand overlay components (tagged with name "live-ligand")
    stage.compList
      .filter((c: any) => c.name === "live-ligand")
      .forEach((c: any) => stage.removeComponent(c));

    // Load new ligand via NGL SMILES protocol
    stage
      .loadFile(`smiles://${smiles}`, { name: "live-ligand" })
      .then((comp: any) => {
        if (!comp) return;
        comp.addRepresentation("ball+stick", {
          colorScheme: "element",
          quality: "high",
        });
        comp.autoView(400);
      })
      .catch(() => {
        // Ligand load failed — silently ignore, protein still visible
      });
  }, [liveData?.best_smiles]);

  // Pocket pulse when a new better score arrives
  useEffect(() => {
    const stage = stageRef.current;
    const score = liveData?.best_score ?? null;
    if (!stage || score === null || score === prevScoreRef.current) return;
    prevScoreRef.current = score;

    stage.compList.forEach((comp: any) => {
      comp.reprList
        .filter((r: any) => r.type === "surface")
        .forEach((r: any) => {
          r.setParameters({ opacity: 0.45 });
          setTimeout(() => r.setParameters({ opacity: 0.18 }), 600);
        });
    });
  }, [liveData?.best_score]);

  // Camera refocus on stage change
  useEffect(() => {
    const stage = stageRef.current;
    const currentStage = liveData?.current_stage ?? null;
    if (!stage || !currentStage || currentStage === prevStageRef.current) return;
    prevStageRef.current = currentStage;
    stage.autoView(800);
  }, [liveData?.current_stage]);

  // Accumulate discovered SMILES when admet_passes increases
  useEffect(() => {
    const smiles = liveData?.best_smiles;
    const passes = liveData?.admet_passes ?? 0;
    if (!smiles || passes === 0) return;
    setDiscoveredSmiles((prev) => {
      if (prev.includes(smiles)) return prev;
      const next = [...prev, smiles].slice(-20); // keep latest 20
      return next;
    });
  }, [liveData?.admet_passes, liveData?.best_smiles]);

  // Auto-scroll discovered strip right when new candidate added
  useEffect(() => {
    const el = discoveredScrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [discoveredSmiles.length]);

  const stageMeta = liveData?.current_stage
    ? STAGE_ICONS[liveData.current_stage]
    : null;
  const ActiveStageIcon = stageMeta?.icon ?? Activity;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#07090d]">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/6 bg-white/[0.02] px-5 py-2.5">
        <FlaskConical size={14} className="text-emerald-400/60" />
        <span className="text-[13px] font-medium text-white/70">
          {targetPdbId} — <span className="capitalize">{mode}</span>
        </span>
        <span
          className={[
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
            STATUS_COLORS[status] ?? "text-white/50",
          ].join(" ")}
        >
          {isRunning && <Loader2 size={9} className="animate-spin" />}
          <span className="capitalize">{status}</span>
        </span>

        {isRunning && liveData && (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-medium text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            live
          </span>
        )}

        <span className="font-mono text-[10px] text-white/20">{jobId}</span>

        {isRunning && (
          <button
            onClick={onCancel}
            disabled={isCancelling}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-red-400/25 bg-red-400/8 px-3 py-1.5 text-[11px] font-medium text-red-400 transition-colors hover:bg-red-400/15 disabled:opacity-50"
          >
            {isCancelling ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />}
            {isCancelling ? "Cancelling…" : "Cancel"}
          </button>
        )}
      </div>

      {/* ── Main split ─────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 divide-x divide-white/5">
        {/* Left — 3D protein viewer */}
        <div className="relative flex w-1/2 flex-col">
          <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2">
            <ActiveStageIcon size={12} className={stageMeta?.color ?? "text-white/30"} />
            <span className={`text-[11px] font-medium ${stageMeta?.color ?? "text-white/30"}`}>
              {stageMeta?.label ?? "Protein Structure"}
            </span>
            <span className="ml-auto font-mono text-[10px] text-white/20">
              {targetPdbId.toUpperCase()}
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <ProteinViewer
              pdbId={targetPdbId}
              height={undefined}
              onStageReady={(stage) => { stageRef.current = stage; }}
            />
          </div>
        </div>

        {/* Right — live dashboard */}
        <div className="flex w-1/2 flex-col overflow-y-auto">
          {/* Stat cards */}
          <div className="grid shrink-0 grid-cols-2 divide-x divide-y divide-white/5 border-b border-white/5 sm:grid-cols-4 sm:divide-y-0">
            <StatCard
              label="Stage"
              value={stageMeta?.label ?? (liveData?.current_stage ?? "—")}
              color={stageMeta?.color ?? "text-white/40"}
            />
            <StatCard
              label="Iterations"
              value={liveData?.iteration_count ? String(liveData.iteration_count) : "—"}
              color="text-violet-300"
            />
            <StatCard
              label="Best Score"
              value={liveData?.best_score != null ? `${liveData.best_score.toFixed(2)} kcal/mol` : "—"}
              color="text-rose-300"
            />
            <StatCard
              label="ADMET Passes"
              value={liveData?.admet_passes ? String(liveData.admet_passes) : "—"}
              color="text-teal-300"
            />
          </div>

          {/* Score chart */}
          <div className="shrink-0 border-b border-white/5 px-4 py-3">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-white/25">
              Binding Affinity over Iterations
            </p>
            {liveData && liveData.score_history.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={liveData.score_history} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <XAxis
                    dataKey="iteration"
                    tick={{ fontSize: 9, fill: "rgba(255,255,255,0.2)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    reversed
                    tick={{ fontSize: 9, fill: "rgba(255,255,255,0.2)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0d0f14",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 8,
                      fontSize: 11,
                      color: "rgba(255,255,255,0.7)",
                    }}
                    formatter={(v: number) => [`${v.toFixed(2)} kcal/mol`, "Score"]}
                    labelFormatter={(l) => `Iter ${l}`}
                  />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#fb7185"
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3, fill: "#fb7185" }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[160px] items-center justify-center text-[11px] text-white/20">
                {isRunning ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={11} className="animate-spin" />
                    Waiting for first score…
                  </span>
                ) : (
                  "No score data"
                )}
              </div>
            )}
          </div>

          {/* Best ligand */}
          <div className="shrink-0 border-b border-white/5 px-4 py-3">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-white/25">
              Current Best Candidate
            </p>
            {liveData?.best_smiles ? (
              <LigandViewer smiles={liveData.best_smiles} width={260} height={160} />
            ) : (
              <div className="flex h-[160px] items-center justify-center rounded-xl border border-white/5 text-[11px] text-white/20">
                {isRunning ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={11} className="animate-spin" />
                    Waiting for candidate…
                  </span>
                ) : (
                  "No candidate yet"
                )}
              </div>
            )}
          </div>

          {/* Discovered strip */}
          {discoveredSmiles.length > 0 && (
            <div className="shrink-0 px-4 py-3">
              <p className="mb-2 text-[10px] uppercase tracking-wider text-white/25">
                Discovered ({discoveredSmiles.length})
              </p>
              <div
                ref={discoveredScrollRef}
                className="flex gap-2 overflow-x-auto pb-1"
              >
                <AnimatePresence initial={false}>
                  {discoveredSmiles.map((smiles, i) => (
                    <motion.div
                      key={smiles}
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.25 }}
                      className="shrink-0"
                    >
                      <LigandViewer smiles={smiles} width={90} height={70} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {isRunning && (
            <p className="mt-auto shrink-0 px-5 py-2 text-[10px] text-white/20">
              <Loader2 size={9} className="inline animate-spin mr-1" />
              Refreshing every 2 s
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
