"use client";

import { PublishToNearButton } from "@/features/agentkit";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Check, ChevronDown, Loader2 } from "lucide-react";
import { usePharmaJobLive } from "../hooks/use-pharma-job-live";
import { LigandViewer } from "./ligand-viewer";
import { CandidateDossier } from "./candidate-dossier";
import { PharmaPeersDrawer } from "./pharma-peers-drawer";
import { ChemicalSpacePlot, ConvergencePlot, Figure } from "./science-figures";
import { LOG_META, STAGE_ICONS, STAGE_ORDER } from "../lib/pharma-stage-config";
import { fragmentSmilesByEnergy, parseScienceLog } from "../lib/pharma-science";
import type { PharmaJob, PipelineLogEntry, PipelineLogLevel } from "../types";

const ProteinViewer = dynamic(
  () => import("./protein-viewer").then((m) => ({ default: m.ProteinViewer })),
  { ssr: false },
);

const STATUS_STYLE: Record<string, string> = {
  queued: "border-amber-400/40 text-amber-300",
  running: "border-sky-400/40 text-sky-300",
  completed: "border-emerald-400/40 text-emerald-300",
  failed: "border-rose-400/40 text-rose-300",
  cancelled: "border-white/15 text-white/40",
};

const QUANTUM_LEVELS = new Set<PipelineLogLevel>(["vqe"]);
const PIPELINE = STAGE_ORDER.filter((s) => s !== "completed");

const STAGE_METHOD: Record<string, string> = {
  init: "load target",
  filtering: "Ro5 seed check",
  generating: "QWGAN pool",
  fragmenting: "BRICS cuts",
  vqe_computing: "VQE ground state",
  docking: "DC-QAOA QUBO",
  scoring: "VQC ΔG + ADMET",
  refining: "scaffold hop",
};

interface Props {
  job: PharmaJob;
  onCancel: () => void;
  isCancelling: boolean;
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

function lastStage(lines: PipelineLogEntry[]): string | null {
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].stage) return lines[i].stage;
  return null;
}

function Readout({ label, value, unit, sub, tone = "text-white" }: { label: React.ReactNode; value: string; unit?: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0 border-b border-r border-white/[0.06] px-4 py-3 lg:border-b-0 lg:last:border-r-0">
      <p className="text-[10px] uppercase tracking-wider text-white/35">{label}</p>
      <p className={`mt-1 font-mono text-[21px] font-semibold leading-tight tabular-nums ${tone}`}>
        {value}
        {unit && <span className="ml-1 text-[11px] font-normal text-white/35">{unit}</span>}
      </p>
      {sub && <p className="mt-0.5 truncate font-mono text-[10px] text-white/30">{sub}</p>}
    </div>
  );
}

function PipelineTrace({ stage, done, iter, maxIter }: { stage: string | null; done: boolean; iter: number; maxIter: number }) {
  const current = stage ? PIPELINE.indexOf(stage) : -1;
  return (
    <div className="border border-white/[0.07] bg-white/[0.015]">
      <ol className="grid grid-cols-4 sm:grid-cols-8" aria-label="Pipeline stages">
        {PIPELINE.map((key, i) => {
          const state = done || i < current ? "done" : i === current ? "active" : "todo";
          return (
            <li
              key={key}
              aria-current={state === "active" ? "step" : undefined}
              className={`relative border-b border-r border-white/[0.05] px-3 py-2 sm:border-b-0 ${state === "active" ? "bg-sky-400/[0.06]" : ""}`}
            >
              <div className="flex items-center gap-1.5 font-mono text-[10px]">
                <span className={state === "done" ? "text-emerald-300" : state === "active" ? "text-sky-300" : "text-white/25"}>
                  {state === "done" ? <Check size={10} aria-hidden /> : state === "active" ? <Loader2 size={10} className="animate-spin" aria-hidden /> : `S${i}`}
                </span>
                <span className={state === "todo" ? "text-white/30" : "text-white/80"}>{STAGE_ICONS[key]?.label ?? key}</span>
              </div>
              <p className="mt-0.5 truncate text-[9.5px] text-white/30">{STAGE_METHOD[key]}</p>
              {state === "active" && <span className="absolute inset-x-0 bottom-0 h-px bg-sky-300/70" aria-hidden />}
            </li>
          );
        })}
      </ol>
      {maxIter > 0 && (
        <div className="flex items-center gap-3 border-t border-white/[0.05] px-3 py-1.5">
          <span className="font-mono text-[10px] text-white/35">iter</span>
          <div className="flex flex-1 gap-0.5">
            {Array.from({ length: maxIter }, (_, i) => {
              const finished = done ? i < iter : i < iter - 1;
              const active = !done && i === iter - 1;
              return <span key={i} className={`h-1.5 flex-1 ${finished ? "bg-emerald-400/60" : active ? "animate-pulse bg-sky-400/70" : "bg-white/[0.07]"}`} />;
            })}
          </div>
          <span className="font-mono text-[10px] tabular-nums text-white/45">{iter}/{maxIter}</span>
        </div>
      )}
    </div>
  );
}

function LogRow({ entry }: { entry: PipelineLogEntry }) {
  const meta = LOG_META[entry.level] ?? LOG_META.info;
  const time = new Date(parseUtc(entry.ts)).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const message = entry.level === "score" ? entry.message.replace(/\s*SMILES:\S+/, "").trim() : entry.message;
  return (
    <li className="grid grid-cols-[4.5rem_3.25rem_1fr] items-baseline gap-2 px-4 py-0.5 font-mono text-[10.5px] hover:bg-white/[0.02]">
      <span className="text-white/25">{time}</span>
      <span className={`text-[9.5px] font-semibold ${meta.color}`}>{meta.label}</span>
      <span className="min-w-0 whitespace-pre-wrap break-words text-white/60">{message}</span>
    </li>
  );
}

export function PharmaLiveCanvas({ job, onCancel, isCancelling }: Props) {
  const { job_id: jobId, target_pdb_id: targetPdbId, mode, status } = job;
  const isRunning = status === "queued" || status === "running";
  const isCompleted = status === "completed";
  const { data: liveData } = usePharmaJobLive(jobId, isRunning);

  const allLogLines = useMemo(() => job.log_lines ?? [], [job.log_lines]);
  const science = useMemo(() => parseScienceLog(allLogLines), [allLogLines]);
  const fragmentNames = useMemo(() => fragmentSmilesByEnergy(science.vqe), [science.vqe]);
  const candidates = job.result?.candidates ?? [];
  const [selected, setSelected] = useState(0);
  const candidate = candidates[Math.min(selected, candidates.length - 1)];

  const molecules = science.molecules;
  const bestMol = molecules.reduce<(typeof molecules)[number] | null>((b, m) => (!b || m.dg < b.dg ? m : b), null);
  const stage = liveData?.current_stage ?? lastStage(allLogLines);
  const iter = liveData?.iteration_count ?? molecules.at(-1)?.iteration ?? 0;
  const maxIter = science.maxIterations;
  const bestDg = isCompleted ? (candidates[0]?.vqc_score.binding_affinity_kcal ?? bestMol?.dg ?? null) : (liveData?.best_score ?? bestMol?.dg ?? null);
  const bestSmiles = isCompleted ? (candidates[0]?.smiles ?? bestMol?.smiles) : (liveData?.best_smiles ?? bestMol?.smiles);
  const passes = molecules.filter((m) => m.admet?.pass).length;
  const peers = new Set(science.vqe.map((v) => v.peer));
  const bioLogLines = allLogLines.filter((l) => !QUANTUM_LEVELS.has(l.level));
  const [logOpen, setLogOpen] = useState(isRunning);
  const [quantumLog, setQuantumLog] = useState(true);
  const shownLog = quantumLog ? allLogLines : bioLogLines;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- NGL ships no types
  const stageRef = useRef<any>(null);
  const prevSmilesRef = useRef<string | null>(null);
  const logScrollRef = useRef<HTMLDivElement>(null);

  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (!isRunning) return;
    const start = parseUtc(job.submitted_at);
    const tick = () => setElapsedSec(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isRunning, job.submitted_at]);

  // NGL: put the current best ligand into the protein scene
  useEffect(() => {
    const ngl = stageRef.current;
    if (!ngl || !bestSmiles || bestSmiles === prevSmilesRef.current) return;
    prevSmilesRef.current = bestSmiles;
    ngl.compList.filter((c: { name: string }) => c.name === "live-ligand").forEach((c: unknown) => ngl.removeComponent(c));
    ngl
      .loadFile(`smiles://${bestSmiles}`, { name: "live-ligand" })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((comp: any) => {
        if (!comp) return;
        comp.addRepresentation("ball+stick", { colorScheme: "element", quality: "high" });
        comp.autoView(400);
      })
      .catch(() => {});
  }, [bestSmiles]);

  useEffect(() => {
    const el = logScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shownLog.length, logOpen]);

  const runtime = isCompleted && job.result ? job.result.total_runtime_seconds : elapsedSec;
  const lead = candidates[0];
  const qubits = [...new Set(lead?.descriptors.map((d) => d.qubit_count) ?? [])].join("/");

  return (
    <div className="h-full overflow-y-auto bg-[#07090d] [background-image:radial-gradient(rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:16px_16px]">
      <header className="sticky top-0 z-10 border-b border-white/[0.07] bg-[#07090d]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 sm:px-6">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">In-silico screen · {mode} · PDB</p>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-[22px] font-semibold tracking-tight text-white">{targetPdbId.toUpperCase()}</h1>
              <span className={`inline-flex items-center gap-1.5 border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${STATUS_STYLE[status] ?? "text-white/50"}`}>
                {isRunning && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
                {status}
              </span>
            </div>
          </div>
          <dl className="hidden gap-x-5 font-mono text-[10px] md:flex">
            <div><dt className="text-white/30">run</dt><dd className="max-w-[200px] truncate text-white/60" title={jobId}>{jobId}</dd></div>
            <div><dt className="text-white/30">submitted (UTC)</dt><dd className="text-white/60">{new Date(parseUtc(job.submitted_at)).toISOString().replace("T", " ").slice(0, 19)}</dd></div>
          </dl>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <PharmaPeersDrawer job={job} liveData={liveData} isRunning={isRunning} />
            {isCompleted && <PublishToNearButton jobId={jobId} />}
            {isRunning && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isCancelling}
                className="inline-flex h-8 items-center gap-1.5 px-3 text-[12px] font-medium text-rose-300 ring-1 ring-rose-400/30 transition-colors hover:bg-rose-400/10 disabled:opacity-50"
              >
                {isCancelling ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                {isCancelling ? "Cancelling…" : "Abort run"}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] space-y-4 px-4 py-5 sm:px-6">
        {job.error && (
          <div className="border border-rose-400/30 bg-rose-400/[0.05] px-4 py-3 font-mono text-[11.5px] text-rose-300">
            <span className="mr-2 font-semibold">RUN {status.toUpperCase()}</span>
            {job.error}
          </div>
        )}

        <PipelineTrace stage={stage} done={isCompleted} iter={iter} maxIter={maxIter} />

        <div className="grid grid-cols-2 border border-white/[0.07] bg-white/[0.015] sm:grid-cols-3 lg:grid-cols-6">
          <Readout label={<>min ΔG<sub>bind</sub></>} value={bestDg != null ? bestDg.toFixed(2) : "—"} unit={bestDg != null ? "kcal/mol" : undefined} sub="VQC · lower binds tighter" tone="text-emerald-300" />
          <Readout label="Ligands scored" value={molecules.length ? String(molecules.length) : "—"} sub={`${passes} pass ADMET`} />
          <Readout label="Iterations" value={iter > 0 ? String(iter) : "—"} unit={maxIter ? `/ ${maxIter}` : undefined} sub={science.hops.length ? `${science.hops.length} scaffold hop${science.hops.length === 1 ? "" : "s"}` : "no hops"} />
          <Readout label="VQE solves" value={science.vqe.length ? String(science.vqe.length) : "—"} sub={qubits ? `${qubits} qubits / fragment` : undefined} />
          <Readout label="Mesh peers" value={peers.size ? String(peers.size) : "—"} sub={job.result ? `${Math.round(job.result.cache_hit_rate * 100)}% VQE cache hits` : undefined} />
          <Readout label={isCompleted ? "Wall time" : "Elapsed"} value={runtime > 0 ? formatDuration(runtime) : "—"} sub={!isCompleted && stage ? (STAGE_ICONS[stage]?.label ?? stage) : undefined} />
        </div>

        <p className="pt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Figure 1 · Target and optimisation trajectory</p>
        <div className="grid gap-3 lg:grid-cols-12">
          <Figure
            panel="a"
            title={`Receptor ${targetPdbId.toUpperCase()}`}
            aside="RCSB · NGL"
            className="lg:col-span-7"
            caption="Crystal structure from RCSB. The best ligand so far is drawn in ball-and-stick with element colours."
          >
            <ProteinViewer pdbId={targetPdbId} height={420} onStageReady={(s) => { stageRef.current = s; }} />
          </Figure>
          <Figure
            panel="b"
            title={isCompleted ? "Lead compound" : "Current best ligand"}
            aside={bestDg != null ? `ΔG ${bestDg.toFixed(2)} kcal/mol` : undefined}
            className="lg:col-span-5"
            caption={bestSmiles ? <span className="break-all font-mono">{bestSmiles}</span> : undefined}
          >
            <div className="flex h-full min-h-[300px] items-center justify-center bg-black/30 p-4">
              {bestSmiles ? (
                <LigandViewer smiles={bestSmiles} width={380} height={300} />
              ) : (
                <p className="text-[11px] text-white/30">{isRunning ? "Waiting for the first scored ligand…" : "No ligand"}</p>
              )}
            </div>
          </Figure>
          <Figure
            panel="c"
            title="Binding free-energy convergence"
            aside="ΔG ± 95% CI"
            className="lg:col-span-6"
            caption="Predicted ΔG for each ligand in the order it was scored. Error bars are the VQC 95% confidence interval. The dashed step is the running minimum."
          >
            <ConvergencePlot molecules={molecules} fallback={liveData?.score_history ?? []} />
          </Figure>
          <Figure
            panel="d"
            title="Chemical space"
            aside="MW × cLogP"
            className="lg:col-span-6"
            caption="Each scored ligand by molecular weight and cLogP. The shaded box is Lipinski space (MW ≤ 500, cLogP ≤ 5). Dots passed ADMET and crosses failed. The dashed path follows the scoring order."
          >
            <ChemicalSpacePlot molecules={molecules} />
          </Figure>
        </div>

        {molecules.length > 0 && (
          <section className="border border-white/[0.07] bg-white/[0.015]">
            <header className="flex flex-wrap items-baseline gap-x-3 border-b border-white/[0.05] px-3.5 py-2">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/50">Table 1 · Scored ligands</h2>
              <span className="text-[10.5px] text-white/30">read from the run log, in scoring order</span>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-wider text-white/35">
                    <th className="px-3 py-1.5 font-medium">#</th>
                    <th className="px-3 py-1.5 font-medium">Iter</th>
                    <th className="px-3 py-1.5 font-medium">Structure</th>
                    <th className="px-3 py-1.5 font-medium">SMILES</th>
                    <th className="px-3 py-1.5 text-right font-medium">ΔG (kcal/mol)</th>
                    <th className="px-3 py-1.5 text-right font-medium">95% CI</th>
                    <th className="px-3 py-1.5 text-right font-medium">MW</th>
                    <th className="px-3 py-1.5 text-right font-medium">cLogP</th>
                    <th className="px-3 py-1.5 text-right font-medium">QED</th>
                    <th className="px-3 py-1.5 text-right font-medium">SA</th>
                    <th className="px-3 py-1.5 font-medium">ADMET</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-[11px] tabular-nums text-white/75">
                  {molecules.map((m, i) => (
                    <tr key={`${i}-${m.smiles}`} className={`border-b border-white/[0.03] ${m === bestMol ? "bg-emerald-400/[0.05]" : ""}`}>
                      <td className="px-3 py-1 text-white/40">{i + 1}</td>
                      <td className="px-3 py-1 text-white/40">{m.iteration}</td>
                      <td className="px-1 py-0.5"><div className="w-[84px]"><LigandViewer smiles={m.smiles} width={80} height={52} /></div></td>
                      <td className="max-w-[260px] truncate px-3 py-1 text-white/85" title={m.smiles}>{m.smiles}</td>
                      <td className={`px-3 py-1 text-right ${m === bestMol ? "font-semibold text-emerald-300" : ""}`}>{m.dg.toFixed(2)}</td>
                      <td className="px-3 py-1 text-right text-white/45">[{m.ciLo.toFixed(2)}, {m.ciHi.toFixed(2)}]</td>
                      <td className="px-3 py-1 text-right">{m.admet?.mw.toFixed(1) ?? "—"}</td>
                      <td className="px-3 py-1 text-right">{m.admet?.logp.toFixed(2) ?? "—"}</td>
                      <td className={`px-3 py-1 text-right ${m.admet && m.admet.qed < 0.4 ? "text-rose-300" : ""}`}>{m.admet?.qed.toFixed(3) ?? "—"}</td>
                      <td className="px-3 py-1 text-right">{m.admet?.sa.toFixed(2) ?? "—"}</td>
                      <td className="px-3 py-1">
                        {m.admet ? <span className={m.admet.pass ? "text-emerald-300" : "text-rose-300"}>{m.admet.pass ? "✓ pass" : "✕ fail"}</span> : <span className="text-white/30">pending</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {candidate && (
          <section className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Figure 2 · Candidate dossier</p>
              {candidates.length > 1 && (
                <div role="tablist" aria-label="Candidate" className="flex flex-wrap gap-1">
                  {candidates.map((c, i) => (
                    <button
                      key={c.rank}
                      type="button"
                      role="tab"
                      aria-selected={i === selected}
                      onClick={() => setSelected(i)}
                      className={`border px-2 py-0.5 font-mono text-[10.5px] ${i === selected ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-200" : "border-white/10 text-white/45 hover:text-white/75"}`}
                    >
                      Cpd {c.rank} · {c.vqc_score.binding_affinity_kcal.toFixed(2)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <CandidateDossier candidate={candidate} fragmentNames={fragmentNames} fragmentPeers={job.result?.fragments_distributed ?? {}} />
          </section>
        )}

        {lead && job.result && (
          <section className="border-l-2 border-white/10 py-1 pl-4">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/50">Methods</h2>
            <p className="mt-1.5 max-w-[95ch] text-[12px] leading-relaxed text-white/55">
              Target <span className="font-mono text-white/75">{targetPdbId.toUpperCase()}</span> was screened in {mode} mode for{" "}
              {job.result.iterations_used} of {maxIter || job.result.iterations_used} iteration{job.result.iterations_used === 1 ? "" : "s"}. Each ligand was cut into BRICS
              fragments, and VQE found each fragment&apos;s ground state in a {qubits}-qubit active space ({lead.descriptors[0]?.gate_count.toLocaleString()} gates,{" "}
              {lead.descriptors[0]?.vqe_iterations} optimiser steps). {science.vqe.length} VQE solves ran on {peers.size} mesh peer{peers.size === 1 ? "" : "s"}, and each
              energy was checked against exact diagonalisation of the same active space. Fragment placement on the binding-site grid was solved as a QUBO with DC-QAOA
              (p = {lead.docking_pose.qaoa_params_beta.length}, α = {lead.docking_pose.dc_qaoa_alpha}), taking the most probable bitstring. A variational quantum
              classifier predicted binding affinity with a 95% confidence interval. Ligands had to pass Lipinski&apos;s rule of five, TPSA ≤ 140 Å², SA ≤ 4 and QED ≥ 0.4.
              Ligands that failed went to the scaffold hopper ({science.hops.length} hop{science.hops.length === 1 ? "" : "s"}). Wall time was{" "}
              {formatDuration(job.result.total_runtime_seconds)}.
            </p>
          </section>
        )}

        <section className="border border-white/[0.07] bg-black/40">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <button type="button" onClick={() => setLogOpen((o) => !o)} aria-expanded={logOpen} className="flex flex-1 items-center gap-2 text-left">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/50">Run log</h3>
              {isRunning && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300" aria-hidden />}
              <span className="font-mono text-[10px] text-white/30">{shownLog.length} lines</span>
              <ChevronDown size={13} className={`ml-auto text-white/40 transition-transform ${logOpen ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {logOpen && (
              <label className="flex items-center gap-1.5 font-mono text-[10px] text-white/40">
                <input type="checkbox" checked={quantumLog} onChange={(e) => setQuantumLog(e.target.checked)} className="accent-amber-400" />
                VQE lines
              </label>
            )}
          </div>
          {logOpen && (
            <div ref={logScrollRef} className="max-h-[340px] overflow-y-auto border-t border-white/[0.06] py-2">
              {shownLog.length === 0 ? (
                <p className="flex items-center gap-2 px-4 py-6 text-[11px] text-white/30">
                  {isRunning && <Loader2 size={12} className="animate-spin" />}
                  {isRunning ? "Waiting for the pipeline to start…" : "No events"}
                </p>
              ) : (
                <ol>
                  {shownLog.map((entry, i) => (
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
