"use client";

import { Button } from "@/components/arc/button/button";
import { useRouter } from "next/navigation";
import {
  Cpu, Zap, BarChart3, Settings2, ArrowLeft, CheckCircle2, XCircle,
  Layers, GitBranch, Clock, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SurfaceCard,
  SectionTitle,
  JobMetaStrip,
  MetricGrid,
  DataTable,
  type MetricItem,
  type DataTableColumn,
} from "@/shared/components/detail";
import { ROUTES } from "@/constants";
import { fmt, pct, num, str, bool, obj, arr } from "./finance-result-summary";
import { CircuitFragmentFlow, type CircuitPlan } from "./circuit-fragment-flow";
import type { FinanceJobDetail } from "../types";

interface FinanceQuantumSummaryProps {
  job: FinanceJobDetail;
  className?: string;
}

// ── Bloch Sphere SVG ─────────────────────────────────────────────────────────
// From measurement-only data: P(|1⟩)=selection_probability → Bloch z-component r_z=2p-1.
// X/Y components (coherences) require full state tomography, unknown from counts alone.
function BlochSphere({ ticker, prob, selected }: { ticker: string; prob: number | null; selected: boolean }) {
  const R = 52;
  const cx = 64;
  const cy = 68;
  const rz = prob !== null ? 2 * prob - 1 : 0;
  const theta = prob !== null ? Math.acos(Math.max(-1, Math.min(1, rz))) : Math.PI / 2;
  const dotX = cx + R * Math.sin(theta) * 0.55;
  const dotY = cy - R * Math.cos(theta);
  const arcR = 18;
  const arcEndX = cx + arcR * Math.sin(theta) * 0.55;
  const arcEndY = cy - arcR * Math.cos(theta);

  const dotColor = prob === null ? "color-mix(in oklab, var(--foreground) 20%, transparent)"
    : prob >= 0.65 ? "var(--success)"
    : prob <= 0.35 ? "color-mix(in oklab, var(--foreground) 15.7%, transparent)"
    : "var(--info)";
  const ringColor = selected ? "var(--success)" : "transparent";
  const alpha = prob !== null ? Math.sqrt(Math.max(0, 1 - prob)) : null;
  const beta  = prob !== null ? Math.sqrt(Math.max(0, prob)) : null;
  const thetaDeg = (theta * 180 / Math.PI).toFixed(1);

  const stateLabel = prob === null ? "unknown"
    : prob >= 0.65 ? "|1⟩ selected"
    : prob <= 0.35 ? "|0⟩ not selected"
    : "|+⟩ superposition";
  const stateLabelColor = prob === null ? "color-mix(in oklab, var(--foreground) 25.1%, transparent)"
    : prob >= 0.65 ? "var(--success)"
    : prob <= 0.35 ? "color-mix(in oklab, var(--foreground) 20.8%, transparent)"
    : "var(--info)";

  return (
    <div className="flex items-start gap-5 rounded-xl bg-surface-muted p-4 ring-1 ring-border">
      {/* SVG sphere */}
      <div className="shrink-0">
        <svg width="128" height="150" viewBox="0 0 128 150" fill="none">
          {/* Sphere */}
          <circle cx={cx} cy={cy} r={R} stroke="color-mix(in oklab, var(--foreground) 8%, transparent)" strokeWidth="1.5" fill="color-mix(in oklab, var(--foreground) 2%, transparent)" />
          {/* Selection ring */}
          <circle cx={cx} cy={cy} r={R + 4} stroke={ringColor} strokeWidth="1.5" fill="none" opacity="0.3" />
          {/* Equatorial ellipse */}
          <ellipse cx={cx} cy={cy} rx={R} ry={R * 0.26} stroke="color-mix(in oklab, var(--foreground) 7%, transparent)" strokeWidth="1" strokeDasharray="4 3" fill="none" />
          {/* Z axis */}
          <line x1={cx} y1={cy - R - 8} x2={cx} y2={cy + R + 8} stroke="color-mix(in oklab, var(--foreground) 10%, transparent)" strokeWidth="1" />
          {/* X axis */}
          <line x1={cx - R * 0.7} y1={cy} x2={cx + R * 0.7} y2={cy} stroke="color-mix(in oklab, var(--foreground) 6%, transparent)" strokeWidth="1" strokeDasharray="3 2" />
          {/* Axis labels */}
          <text x={cx} y={cy - R - 12} textAnchor="middle" fontSize="11" fill="color-mix(in oklab, var(--foreground) 40%, transparent)">|1⟩</text>
          <text x={cx} y={cy + R + 20} textAnchor="middle" fontSize="11" fill="color-mix(in oklab, var(--foreground) 20%, transparent)">|0⟩</text>
          <text x={cx + R * 0.7 + 6} y={cy + 4} fontSize="10" fill="color-mix(in oklab, var(--foreground) 18%, transparent)">X</text>
          <text x={cx + 4} y={cy - R - 4} fontSize="10" fill="color-mix(in oklab, var(--foreground) 18%, transparent)">Z</text>
          {/* θ arc */}
          {prob !== null && theta > 0.08 && theta < Math.PI - 0.08 && (
            <>
              <path d={`M ${cx} ${cy - arcR} Q ${cx + arcR * 0.35} ${cy - arcR * 0.85} ${arcEndX} ${arcEndY}`}
                stroke="color-mix(in oklab, var(--foreground) 22%, transparent)" strokeWidth="1.2" fill="none" />
              <text x={cx + 8} y={cy - arcR + 14} fontSize="10" fontStyle="italic" fill="color-mix(in oklab, var(--foreground) 35%, transparent)">θ</text>
            </>
          )}
          {/* State vector */}
          <line x1={cx} y1={cy} x2={dotX} y2={dotY} stroke={dotColor} strokeWidth="2" opacity="0.75" />
          {/* r_z dashed projection */}
          {prob !== null && (
            <line x1={dotX} y1={dotY} x2={dotX} y2={cy} stroke={dotColor} strokeWidth="1" strokeDasharray="3 2" opacity="0.25" />
          )}
          {/* State dot */}
          <circle cx={dotX} cy={dotY} r="6" fill={dotColor} opacity="0.95" />
          <circle cx={dotX} cy={dotY} r="3" fill="white" opacity="0.4" />
          {/* Center */}
          <circle cx={cx} cy={cy} r="2.5" fill="color-mix(in oklab, var(--foreground) 15%, transparent)" />
        </svg>
      </div>

      {/* State data column */}
      <div className="flex flex-1 flex-col gap-3 pt-1">
        {/* Ticker + state label */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-subtle">{ticker}</span>
          <span className="text-sm font-medium" style={{ color: stateLabelColor }}>{stateLabel}</span>
        </div>

        {/* State vector */}
        {alpha !== null && beta !== null && (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-0.5">
              <p className="text-xs text-faint">State Vector</p>
              <p className="font-mono text-sm text-foreground">
                |ψ⟩ ≈ {alpha.toFixed(3)}<span className="text-subtle">|0⟩</span>
                <span className="mx-1 text-faint">+</span>
                {beta.toFixed(3)}<span className="text-subtle">|1⟩</span>
              </p>
            </div>

            {/* θ and ⟨Z⟩ */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-0.5">
                <p className="text-xs text-faint">Polar angle θ</p>
                <p className="font-mono text-sm text-foreground tabular-nums">{thetaDeg}°</p>
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-xs text-faint">⟨Z⟩ component</p>
                <p className="font-mono text-sm text-foreground tabular-nums">{rz.toFixed(4)}</p>
              </div>
            </div>

            {/* Density matrix diagonal */}
            <div className="flex flex-col gap-0.5">
              <p className="text-xs text-faint">Density matrix (diagonal)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-surface-muted px-3 py-1.5 text-center ring-1 ring-border">
                  <p className="text-xs text-faint">ρ₀₀</p>
                  <p className="font-mono text-sm text-subtle tabular-nums">{(1 - prob!).toFixed(4)}</p>
                </div>
                <div className="rounded-lg px-3 py-1.5 text-center ring-1" style={{ background: `color-mix(in oklab, ${dotColor} 7%, transparent)`, borderColor: `color-mix(in oklab, ${dotColor} 19%, transparent)` }}>
                  <p className="text-xs" style={{ color: `color-mix(in oklab, ${dotColor} 50%, transparent)` }}>ρ₁₁</p>
                  <p className="font-mono text-sm tabular-nums" style={{ color: dotColor }}>{prob!.toFixed(4)}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Top states table ─────────────────────────────────────────────────────────
type TopStateRow = { rank: number; bitstring: string; assets: string; prob: string; ret: string; feasible: boolean };
const topStateCols: DataTableColumn<TopStateRow>[] = [
  { key: "rank", header: "#", align: "left", render: (r) => <span className="text-xs text-faint tabular-nums">{r.rank}</span> },
  { key: "bitstring", header: "Bitstring", align: "left", render: (r) => <span className="font-mono text-xs text-subtle">{r.bitstring}</span> },
  { key: "assets", header: "Assets", align: "left", render: (r) => <span className="text-xs text-subtle">{r.assets || "-"}</span> },
  { key: "prob", header: "Probability", align: "right" },
  { key: "ret", header: "Return", align: "right" },
  {
    key: "feasible", header: "Valid", align: "right",
    render: (r) => r.feasible
      ? <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-success" />
      : <XCircle className="ml-auto h-3.5 w-3.5 text-faint" />,
  },
];

// ── Gate counts table ─────────────────────────────────────────────────────────
type GateRow = { gate: string; count: string };
const gateCols: DataTableColumn<GateRow>[] = [
  { key: "gate", header: "Gate", align: "left", render: (r) => <span className="font-mono text-sm text-foreground">{r.gate}</span> },
  { key: "count", header: "Count", align: "right" },
];

// ── Execution pipeline timeline ───────────────────────────────────────────────
interface PipelineStep {
  label: string;
  sublabel: string;
  durationMs: number | null;
  status: "done" | "pending";
}
function ExecutionPipeline({ steps }: { steps: PipelineStep[] }) {
  const total = steps.reduce((s, st) => s + (st.durationMs ?? 0), 0);
  return (
    <div className="flex flex-col gap-0">
      {steps.map((step, i) => {
        const widthPct = total > 0 && step.durationMs !== null ? (step.durationMs / total) * 100 : 0;
        return (
          <div key={step.label} className="flex items-stretch gap-3">
            {/* Timeline spine */}
            <div className="flex flex-col items-center" style={{ minWidth: 20 }}>
              <div className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-1",
                step.status === "done"
                  ? "bg-success/20 ring-success/40"
                  : "bg-surface-muted ring-border",
              )}>
                <span className={cn("h-1.5 w-1.5 rounded-full", step.status === "done" ? "bg-success" : "bg-surface-raised")} />
              </div>
              {i < steps.length - 1 && <div className="mt-0.5 w-px flex-1 bg-surface-muted" />}
            </div>
            {/* Content */}
            <div className={cn("flex-1 pb-4", i === steps.length - 1 && "pb-0")}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={cn("text-sm font-medium", step.status === "done" ? "text-foreground" : "text-faint")}>{step.label}</span>
                {step.durationMs !== null && (
                  <span className="shrink-0 font-mono text-xs text-faint">{step.durationMs}ms</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-faint">{step.sublabel}</p>
              {step.durationMs !== null && widthPct > 0 && (
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-success/40"
                    style={{ width: `${Math.max(widthPct, 2)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Hamiltonian coupling heatmap ──────────────────────────────────────────────
function HamiltonianGrid({
  tickers, linearFields, couplings,
}: {
  tickers: string[];
  linearFields: Array<{ asset: number; coefficient: number }>;
  couplings: Array<{ asset_i: number; asset_j: number; coefficient: number }>;
}) {
  const n = tickers.length;
  if (n === 0) return null;

  // Build n×n matrix: diagonal = linear field, off-diagonal = coupling
  const matrix: (number | null)[][] = Array.from({ length: n }, () => Array(n).fill(null));
  linearFields.forEach(({ asset, coefficient }) => { matrix[asset][asset] = coefficient; });
  couplings.forEach(({ asset_i, asset_j, coefficient }) => {
    matrix[asset_i][asset_j] = coefficient;
    matrix[asset_j][asset_i] = coefficient;
  });

  const allVals = [...linearFields.map(f => Math.abs(f.coefficient)), ...couplings.map(c => Math.abs(c.coefficient))];
  const maxAbs = Math.max(...allVals, 1e-9);

  function cellColor(val: number | null, isDiag: boolean): string {
    if (val === null) return "color-mix(in oklab, var(--foreground) 2%, transparent)";
    const intensity = Math.abs(val) / maxAbs;
    if (isDiag) return `color-mix(in oklab, var(--success) ${(0.08 + intensity * 0.35) * 100}%, transparent)`;
    return val > 0
      ? `color-mix(in oklab, var(--warning) ${(0.06 + intensity * 0.30) * 100}%, transparent)`
      : `color-mix(in oklab, var(--danger) ${(0.06 + intensity * 0.30) * 100}%, transparent)`;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="w-16 text-right text-xs text-faint pr-2" />
            {tickers.map((t) => (
              <th key={t} className="text-center text-xs text-faint pb-1 font-medium">{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickers.map((rowTicker, ri) => (
            <tr key={rowTicker}>
              <td className="text-right text-xs text-faint pr-2 font-medium">{rowTicker}</td>
              {tickers.map((_, ci) => {
                const val = matrix[ri][ci];
                const isDiag = ri === ci;
                return (
                  <td
                    key={ci}
                    className="h-8 min-w-[2.5rem] rounded text-center tabular-nums align-middle"
                    style={{ background: cellColor(val, isDiag) }}
                    title={val !== null ? `${rowTicker}↔${tickers[ci]}: ${val.toFixed(6)}` : "no interaction"}
                  >
                    {val !== null && (
                      <span className="text-xs text-subtle">{val > 0 ? "+" : ""}{val.toFixed(3)}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-4 text-xs text-faint">
        <span><span className="mr-1 inline-block h-2 w-4 rounded bg-success/30" />Linear field (diagonal)</span>
        <span><span className="mr-1 inline-block h-2 w-4 rounded bg-warning/30" />+ZZ coupling</span>
        <span><span className="mr-1 inline-block h-2 w-4 rounded bg-danger/30" />−ZZ coupling</span>
      </div>
    </div>
  );
}

// ── Superscript math helper ───────────────────────────────────────────────────
function PowerOf2({ n, result }: { n: number; result: number }) {
  return (
    <span className="tabular-nums text-foreground">
      2<sup className="text-xs">{n}</sup>
      <span className="mx-1 text-faint">=</span>
      {result.toLocaleString()}
    </span>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function FinanceQuantumSummary({ job, className }: FinanceQuantumSummaryProps) {
  const router = useRouter();
  const problemType = job.problemType ?? (job.result ? str(obj(job.result).problem_type) : null);
  const hasResult = !!job.result && problemType === "portfolio_optimization";

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <JobMetaStrip
        jobId={job.jobId}
        status={job.status}
        createdAt={job.createdAt}
        extraBadges={
          problemType
            ? [{ label: problemType, className: "border-success/30 bg-success/10 text-success" }]
            : []
        }
        rightContent={
          <Button variant="secondary" size="sm"
            onClick={() => router.push(ROUTES.financeDetail(job.jobId))}>
            <ArrowLeft className="h-3 w-3" />
            Back to Finance
          </Button>
        }
      />

      {hasResult ? (
        <QuantumDetails result={job.result!} />
      ) : (
        <SurfaceCard>
          <p className="text-sm text-faint">No quantum execution data available yet.</p>
        </SurfaceCard>
      )}
    </div>
  );
}

function QuantumDetails({ result }: { result: Record<string, unknown> }) {
  const quantumExec = obj(result.quantum_execution);
  const qaoa = obj(quantumExec.qaoa_parameters);
  const circuitSummary = obj(quantumExec.circuit_summary);
  const topStates = arr(quantumExec.top_states);
  const hamiltonian = obj(quantumExec.hamiltonian);
  const solverDiag = obj(result.solver_diagnostics);
  const qSolver = obj(solverDiag.quantum_solver);
  const cSolver = obj(solverDiag.classical_solver);
  const benchmark = obj(result.benchmark);
  const timings = obj(benchmark.timings);
  const assetUniverse = arr(result.asset_universe);
  const encodedAssets = arr(quantumExec.encoded_assets).map(str);

  // Circuit fragment plan and execution results
  const planRaw = quantumExec.plan;
  const plan: CircuitPlan | null = planRaw && typeof planRaw === "object" ? planRaw as CircuitPlan : null;
  const fragmentResultsArr = arr(quantumExec.fragment_results).map((r) => r as Record<string, unknown>);

  // Bloch sphere data: one sphere per encoded asset
  const assetProbMap = new Map<string, number>(
    assetUniverse.map((a) => {
      const asset = obj(a);
      return [str(asset.ticker), num(asset.selection_probability) ?? 0];
    }),
  );
  const quantumSelected = new Set<string>(
    assetUniverse.filter((a) => bool(obj(a).selected_quantum)).map((a) => str(obj(a).ticker)),
  );

  // QAOA metrics
  const qaoaMetrics: MetricItem[] = [
    { label: "QAOA Reps (p)", value: num(qaoa.reps) ?? "-", accent: true },
    { label: "β (beta)", value: num(qaoa.beta) !== null ? fmt(num(qaoa.beta)!, 6) : "-" },
    { label: "γ (gamma)", value: num(qaoa.gamma) !== null ? fmt(num(qaoa.gamma)!, 6) : "-" },
    { label: "Search Steps", value: num(qaoa.parameter_search_steps) ?? "-" },
  ];

  // Circuit metrics
  const circuitMetrics: MetricItem[] = [
    { label: "Qubits", value: num(circuitSummary.qubit_count) ?? "-", accent: true },
    { label: "Depth", value: num(circuitSummary.depth) ?? "-" },
    { label: "Gates (size)", value: num(circuitSummary.size) ?? "-" },
    { label: "Parameters", value: num(circuitSummary.parameter_count) ?? "-" },
  ];

  // Gate breakdown table
  const gateCounts = obj(circuitSummary.gate_counts);
  const gateRows: GateRow[] = Object.entries(gateCounts)
    .sort(([, a], [, b]) => (num(b) ?? 0) - (num(a) ?? 0))
    .map(([gate, count]) => ({ gate, count: String(num(count) ?? count) }));

  // Top QAOA states
  const topStateRows: TopStateRow[] = topStates.map((s) => {
    const state = obj(s);
    return {
      rank: num(state.rank) ?? 0,
      bitstring: str(state.bitstring),
      assets: arr(state.selected_assets).map(str).join(", "),
      prob: num(state.probability) !== null ? pct(num(state.probability)!) : "-",
      ret: num(state.expected_return) !== null ? pct(num(state.expected_return)!) : "-",
      feasible: bool(state.feasible),
    };
  });

  // Hamiltonian data
  const linearFields = arr(hamiltonian.linear_fields).map((f) => {
    const field = obj(f);
    return { asset: num(field.asset) ?? 0, coefficient: num(field.coefficient) ?? 0 };
  });
  const couplings = arr(hamiltonian.couplings).map((c) => {
    const coupling = obj(c);
    return {
      asset_i: num(coupling.asset_i) ?? 0,
      asset_j: num(coupling.asset_j) ?? 0,
      coefficient: num(coupling.coefficient) ?? 0,
    };
  });

  // Execution pipeline steps (ordered)
  const sharedPrep = num(timings.shared_preparation_duration_ms);
  const classicalSolve = num(timings.classical_solve_duration_ms);
  const qaParamSearch = num(timings.quantum_parameter_search_duration_ms);
  const circuitCompile = num(timings.quantum_circuit_compile_duration_ms);
  const solutionExtract = num(timings.quantum_solution_extraction_duration_ms);
  const totalMs = num(timings.workflow_total_duration_ms);

  const pipelineSteps: PipelineStep[] = [
    { label: "Dataset Preparation", sublabel: `Loaded ${encodedAssets.length} assets, computed covariance matrix`, durationMs: sharedPrep, status: "done" },
    { label: "Ising Hamiltonian Encoding", sublabel: `${linearFields.length} linear fields · ${couplings.length} ZZ couplings · quadratic budget penalty`, durationMs: null, status: "done" },
    { label: "Initial State Preparation", sublabel: str(qaoa.initial_state_strategy).replace(/_/g, " ") + " · warm start: " + str(qaoa.warm_start_bitstring), durationMs: null, status: "done" },
    { label: "QAOA Parameter Search", sublabel: `${num(qSolver.parameter_evaluations) ?? "?"} evaluations · ${num(qSolver.coarse_grid_steps) ?? "?"} coarse grid steps · ${num(qSolver.local_refinement_rounds) ?? "?"} refinement rounds`, durationMs: qaParamSearch, status: "done" },
    { label: "Circuit Compilation", sublabel: `${num(circuitSummary.qubit_count) ?? "?"}-qubit QAOA · depth ${num(circuitSummary.depth) ?? "?"} · ${num(circuitSummary.size) ?? "?"} gates`, durationMs: circuitCompile, status: "done" },
    { label: "Solution Extraction", sublabel: `Top ${topStates.length} measurement states ranked by probability`, durationMs: solutionExtract, status: "done" },
    { label: "Classical Benchmarking", sublabel: `${str(cSolver.strategy).replace(/_/g, " ")} · ${num(cSolver.evaluated_portfolios) ?? "?"} portfolios evaluated`, durationMs: classicalSolve, status: "done" },
    { label: "Distributed Execution", sublabel: "Distributed fragment execution not yet active, running local simulation", durationMs: 0, status: "pending" },
  ];

  const totalBinaryStates = num(solverDiag.total_binary_states);
  const screened = num(solverDiag.screened_asset_count) ?? encodedAssets.length;
  const logN = screened > 0 ? Math.round(Math.log2(totalBinaryStates ?? 2 ** screened)) : screened;

  return (
    <>
      {/* ── Bloch Spheres ─────────────────────────────────────────────────── */}
      {encodedAssets.length > 0 && (
        <SurfaceCard>
          <SectionTitle
            icon={Activity}
            title="Qubit States (Bloch Spheres)"
            accentColor="emerald"
            tooltip="Bloch spheres visualize each qubit's quantum state. North pole = |1⟩ (asset selected), south pole = |0⟩ (not selected), equator = superposition (uncertain). The state vector arrow shows where the qubit collapsed after measurement."
            badge={<span className="text-xs text-faint">selection probability → state vector</span>}
          />
          <div className="grid grid-cols-1 gap-3 pt-3 lg:grid-cols-2">
            {encodedAssets.map((ticker) => (
              <BlochSphere
                key={ticker}
                ticker={ticker}
                prob={assetProbMap.get(ticker) ?? null}
                selected={quantumSelected.has(ticker)}
              />
            ))}
          </div>

          {/* Legend callout */}
          <div className="mt-6 rounded-xl border-l-2 border-success/40 bg-success/4 px-5 py-4 ring-1 ring-success/10">
            <p className="mb-3 text-sm font-medium text-success">How to read the Bloch Sphere</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                {
                  dot: "var(--success)",
                  label: "North pole  |1⟩",
                  desc: "State vector points upward. The asset was selected by QAOA with high confidence (measurement probability ≥ 0.65).",
                },
                {
                  dot: "var(--info)",
                  label: "Equator  |+⟩",
                  desc: "State vector lies on the equatorial plane, the qubit is in superposition. Selection is uncertain; the algorithm gave no strong preference.",
                },
                {
                  dot: "color-mix(in oklab, var(--foreground) 15.7%, transparent)",
                  label: "South pole  |0⟩",
                  desc: "State vector points downward. The asset was not selected by QAOA (measurement probability ≤ 0.35).",
                },
              ].map(({ dot, label, desc }) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-full ring-1 ring-border" style={{ background: dot }} />
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-foreground">{label}</span>
                    <span className="text-xs leading-relaxed text-subtle">{desc}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 border-t border-border pt-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-subtle">State vector formula</p>
                <p className="text-sm text-foreground">
                  <span className="font-mono">|ψ⟩ ≈ α|0⟩ + β|1⟩</span>
                  <span className="ml-2 text-xs text-faint">where α² = P(|0⟩) and β² = P(|1⟩)</span>
                </p>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-subtle">Derived quantities</p>
                <p className="text-xs leading-relaxed text-subtle">
                  <span className="font-mono text-subtle">⟨Z⟩ = 2p − 1</span> is the Bloch z-component.{" "}
                  <span className="font-mono text-subtle">θ = 2 · arccos(√p)</span> is the polar angle from the north pole.{" "}
                  <span className="font-mono text-subtle">ρ₀₀ = 1 − p</span>, <span className="font-mono text-subtle">ρ₁₁ = p</span> are density matrix diagonals.{" "}
                  ⟨X⟩ and ⟨Y⟩ coherences are unavailable from measurement counts alone, full state tomography required.
                </p>
              </div>
            </div>
          </div>
        </SurfaceCard>
      )}

      {/* ── Circuit Fragment Flow ────────────────────────────────────────── */}
      <SurfaceCard>
        <SectionTitle
          icon={GitBranch}
          title="Circuit Fragment Execution Flow"
          accentColor="emerald"
          tooltip="The QAOA circuit split into fragments distributed across quantum nodes. Each node executes its fragment; results are classically recombined to reconstruct the full quantum probability distribution."
          badge={
            <span className="text-xs text-faint">
              {plan ? `${Object.keys(plan?.fragments ?? {}).length} fragments` : "plan pending"}
            </span>
          }
        />
        <CircuitFragmentFlow plan={plan} fragmentResults={fragmentResultsArr} />
      </SurfaceCard>

      {/* ── Execution Pipeline ────────────────────────────────────────────── */}
      <SurfaceCard>
        <SectionTitle
          icon={Clock}
          title="Execution Pipeline"
          accentColor="emerald"
          tooltip="Timeline of QAOA stages from circuit compilation through variational optimization to final measurement. Each stage feeds results into the next."
          badge={totalMs !== null ? <span className="font-mono text-xs text-faint">{totalMs}ms total</span> : undefined}
        />
        <ExecutionPipeline steps={pipelineSteps} />
      </SurfaceCard>

      {/* ── QAOA Parameters ───────────────────────────────────────────────── */}
      <SurfaceCard>
        <SectionTitle
          icon={Zap}
          title="QAOA Parameters"
          accentColor="emerald"
          tooltip="Variational angles γ (phase separation, encodes the cost function) and β (mixing, explores solution space), optimized by the classical outer loop. More layers (p) increase expressibility at the cost of circuit depth."
          badge={
            <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success ring-1 ring-success/20">
              {str(qaoa.mixer_strategy).replace(/_/g, " ")}
            </span>
          }
        />
        <MetricGrid metrics={qaoaMetrics} accentClass="text-success" />
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 md:grid-cols-3">
          {[
            { label: "Search Strategy", value: str(qaoa.search_strategy).replace(/_/g, " ") },
            { label: "Initial State", value: str(qaoa.initial_state_strategy).replace(/_/g, " ") },
            { label: "Warm Start Bitstring", value: str(qaoa.warm_start_bitstring) },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-1">
              <p className="text-xs text-faint">{label}</p>
              <p className="font-mono text-xs text-subtle capitalize">{value}</p>
            </div>
          ))}
        </div>
        {arr(qaoa.beta_parameters).length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4">
            <div>
              <p className="mb-1.5 text-xs text-faint">β parameters</p>
              <div className="flex flex-wrap gap-1.5">
                {arr(qaoa.beta_parameters).map((v, i) => (
                  <span key={i} className="rounded-md bg-surface-muted px-2 py-1 font-mono text-xs text-success ring-1 ring-border">
                    {num(v) !== null ? fmt(num(v)!, 4) : str(v)}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-faint">γ parameters</p>
              <div className="flex flex-wrap gap-1.5">
                {arr(qaoa.gamma_parameters).map((v, i) => (
                  <span key={i} className="rounded-md bg-surface-muted px-2 py-1 font-mono text-xs text-subtle ring-1 ring-border">
                    {num(v) !== null ? fmt(num(v)!, 4) : str(v)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </SurfaceCard>

      {/* ── Circuit Summary ───────────────────────────────────────────────── */}
      <SurfaceCard>
        <SectionTitle icon={Cpu} title="Circuit Summary" accentColor="emerald" tooltip="Key metrics of the compiled QAOA quantum circuit. Depth is the number of sequential gate layers, shallower circuits have lower error rates on current hardware." />
        <MetricGrid metrics={circuitMetrics} accentClass="text-success" />
        {gateRows.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-3 text-xs text-faint">Gate Breakdown</p>
            <DataTable rows={gateRows} columns={gateCols} getRowKey={(r) => r.gate} />
          </div>
        )}
      </SurfaceCard>

      {/* ── Top QAOA Measurement States ───────────────────────────────────── */}
      {topStateRows.length > 0 && (
        <SurfaceCard>
          <SectionTitle
            icon={BarChart3}
            title="Top Measurement States"
            accentColor="emerald"
            tooltip="Most frequently observed bitstrings when the QAOA circuit was measured. Each bitstring encodes a portfolio: bit '1' means the asset at that position was selected. Higher probability = stronger algorithmic preference."
            badge={<span className="text-xs text-faint">top {topStateRows.length} of 2<sup className="text-xs">{logN}</sup></span>}
          />
          <DataTable rows={topStateRows} columns={topStateCols} getRowKey={(r) => r.bitstring} />
        </SurfaceCard>
      )}

      {/* ── Hamiltonian Coupling Matrix ───────────────────────────────────── */}
      {(linearFields.length > 0 || couplings.length > 0) && (
        <SurfaceCard>
          <SectionTitle
            icon={GitBranch}
            title="Ising Hamiltonian"
            accentColor="emerald"
            tooltip="Ising Hamiltonian coupling matrix encoding the portfolio optimization. Each cell J_ij shows the interaction strength between asset qubits i and j, negative values favour joint selection; positive values penalise it. Linear terms h_i encode individual asset biases."
            badge={
              <span className="text-xs text-faint">
                offset = {fmt(num(hamiltonian.offset) ?? 0, 4)} · {str(hamiltonian.penalty_strategy).replace(/_/g, " ")}
              </span>
            }
          />
          <HamiltonianGrid tickers={encodedAssets} linearFields={linearFields} couplings={couplings} />
        </SurfaceCard>
      )}

      {/* ── Quantum Solver ────────────────────────────────────────────────── */}
      <SurfaceCard>
        <SectionTitle
          icon={Layers}
          title="Quantum Solver"
          accentColor="emerald"
          tooltip="Configuration of the QAOA variational circuit: ansatz structure, number of layers (reps), mixer type, and whether constraint-preserving gates were used to always produce feasible portfolio allocations."
          badge={
            <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-subtle ring-1 ring-border">
              {str(qSolver.ansatz)} p={num(qSolver.reps) ?? "?"}
            </span>
          }
        />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Strategy", value: str(qSolver.strategy).replace(/_/g, " ") },
            { label: "Parameter Evaluations", value: num(qSolver.parameter_evaluations) ?? "-" },
            { label: "Screened Assets", value: num(solverDiag.screened_asset_count) ?? "-" },
            {
              label: "State Space",
              value: totalBinaryStates !== null
                ? <PowerOf2 n={logN} result={totalBinaryStates} />
                : "-",
            },
            { label: "Coarse Grid Steps", value: num(qSolver.coarse_grid_steps) ?? "-" },
            { label: "Local Refinement Rounds", value: num(qSolver.local_refinement_rounds) ?? "-" },
            { label: "Mixer", value: str(qSolver.mixer).replace(/_/g, " ") },
            { label: "Initial State", value: str(qSolver.initial_state).replace(/_/g, " ") },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-1">
              <p className="text-xs text-faint">{label}</p>
              <p className="text-sm text-foreground capitalize tabular-nums">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          {bool(qSolver.constraint_preserving) && (
            <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs text-success ring-1 ring-success/20">Constraint Preserving</span>
          )}
          {bool(qSolver.distributed) && (
            <span className="rounded-full bg-info/10 px-2.5 py-1 text-xs text-info ring-1 ring-info/20">Distributed</span>
          )}
          <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-faint ring-1 ring-border capitalize">{str(qSolver.backend)}</span>
        </div>
      </SurfaceCard>

      {/* ── Classical Solver ──────────────────────────────────────────────── */}
      <SurfaceCard>
        <SectionTitle icon={Settings2} title="Classical Solver" accentColor="emerald" tooltip="The classical optimizer that tunes the QAOA angles. It runs on a classical CPU and evaluates the quantum circuit repeatedly, adjusting γ and β to minimize the cost function." />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Strategy", value: str(cSolver.strategy).replace(/_/g, " ") },
            { label: "Evaluated Portfolios", value: num(cSolver.evaluated_portfolios) ?? "-" },
            { label: "Feasible Count", value: num(solverDiag.feasible_portfolio_count) ?? "-" },
            { label: "Compute Model", value: str(cSolver.compute_model).replace(/_/g, " ") },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-1">
              <p className="text-xs text-faint">{label}</p>
              <p className="text-sm text-foreground capitalize tabular-nums">{String(value)}</p>
            </div>
          ))}
        </div>
      </SurfaceCard>
    </>
  );
}
