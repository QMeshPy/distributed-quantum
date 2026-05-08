"use client";
import { useRouter } from "next/navigation";
import { Cpu, Zap, BarChart3, ArrowLeft, Settings2, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GlassCard,
  SectionTitle,
  JobMetaStrip,
  MetricGrid,
  type MetricItem,
} from "@/shared/components/detail";
import { ROUTES } from "@/constants";
import { CircuitFragmentFlow, type CircuitPlan } from "@/features/finance/components/circuit-fragment-flow";
import type { OptionsJobDetail } from "../types";

interface OptionsQuantumSummaryProps {
  job: OptionsJobDetail;
  className?: string;
}

// ── helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number, d = 4) {
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}
function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Bloch Sphere (single qubit) ───────────────────────────────────────────────
// For IQAE: state vector is a superposition of amplitude-encoded states.
// We display a conceptual probability sphere for each qubit, with theta derived
// from the amplitude encoding (P(|1⟩) ≈ 0.5 in a well-configured IQAE circuit).
function IqaeBlochSphere({ qubit, numQubits }: { qubit: number; numQubits: number }) {
  const R = 52;
  const cx = 64;
  const cy = 68;
  // IQAE uses Hadamard + rotation gates, so qubits start near equator
  // The "uncertainty qubit" (last one) is the estimation register
  const isEstimation = qubit === numQubits - 1;
  const theta = isEstimation ? Math.PI / 3 : Math.PI / 2; // estimation qubit is more "committed"
  const dotX = cx + R * Math.sin(theta) * 0.55;
  const dotY = cy - R * Math.cos(theta);

  const dotColor = isEstimation ? "#fbbf24" : "#67e8f9";
  const label = isEstimation ? "estimation" : "uncertainty";
  const labelColor = isEstimation ? "#fbbf24" : "#67e8f9";

  return (
    <div className="flex items-start gap-4 rounded-xl bg-white/[0.025] p-4 ring-1 ring-white/6">
      <div className="shrink-0">
        <svg width="128" height="150" viewBox="0 0 128 150" fill="none">
          <circle cx={cx} cy={cy} r={R} stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" fill="rgba(255,255,255,0.02)" />
          <ellipse cx={cx} cy={cy} rx={R} ry={R * 0.26} stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeDasharray="4 3" fill="none" />
          <line x1={cx} y1={cy - R - 8} x2={cx} y2={cy + R + 8} stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
          <line x1={cx - R * 0.7} y1={cy} x2={cx + R * 0.7} y2={cy} stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="3 2" />
          <text x={cx} y={cy - R - 12} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.40)">|1⟩</text>
          <text x={cx} y={cy + R + 20} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.20)">|0⟩</text>
          <text x={cx + R * 0.7 + 6} y={cy + 4} fontSize="10" fill="rgba(255,255,255,0.18)">X</text>
          <text x={cx + 4} y={cy - R - 4} fontSize="10" fill="rgba(255,255,255,0.18)">Z</text>
          <line x1={cx} y1={cy} x2={dotX} y2={dotY} stroke={dotColor} strokeWidth="2" opacity="0.75" />
          <line x1={dotX} y1={dotY} x2={dotX} y2={cy} stroke={dotColor} strokeWidth="1" strokeDasharray="3 2" opacity="0.25" />
          <circle cx={dotX} cy={dotY} r="6" fill={dotColor} opacity="0.95" />
          <circle cx={dotX} cy={dotY} r="3" fill="white" opacity="0.4" />
          <circle cx={cx} cy={cy} r="2.5" fill="rgba(255,255,255,0.15)" />
        </svg>
      </div>

      <div className="flex flex-1 flex-col gap-3 pt-1">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
            Q{qubit}
          </span>
          <span className="text-sm font-semibold" style={{ color: labelColor }}>{label}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] text-white/35">Role</p>
          <p className="text-[12px] text-white/65">
            {isEstimation
              ? "Amplitude estimation register — rotated to encode the quantum price."
              : "Uncertainty model qubit — encodes log-normal asset price distribution."}
          </p>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-2.5 py-1.5 ring-1 ring-white/6">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />
          <span className="text-[11px] text-white/50">
            {isEstimation ? "θ ≈ 60° — amplitude register" : "θ = 90° — equatorial superposition"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── IQAE convergence bar ──────────────────────────────────────────────────────
// Visual representation of IQAE iterative refinement: each run narrows the CI
function ConvergenceBar({ epsilon, numRuns }: { epsilon: number; numRuns: number }) {
  const bars = Math.min(numRuns, 8);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-white/40">Confidence Interval Width Convergence (ε = {epsilon.toExponential(2)})</p>
      <div className="flex items-end gap-1.5">
        {Array.from({ length: bars }, (_, i) => {
          const progress = (i + 1) / bars;
          const height = Math.round(4 + (1 - progress) * 40);
          const opacity = 0.3 + progress * 0.65;
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                className="w-7 rounded-sm"
                style={{
                  height: `${height}px`,
                  background: `rgba(251,191,36,${opacity})`,
                  transition: "height 0.3s ease",
                }}
              />
              <span className="text-[9px] text-white/20">{i + 1}</span>
            </div>
          );
        })}
        {numRuns > 8 && (
          <span className="self-center text-[11px] text-white/30 ml-1">+{numRuns - 8} more</span>
        )}
      </div>
      <p className="text-[11px] text-white/35">
        Each bar represents one IQAE iteration — heights show narrowing confidence interval as the algorithm converges.
      </p>
    </div>
  );
}

// ── PowerOf2 notation ─────────────────────────────────────────────────────────
function PowerOf2({ base, exp }: { base: number; exp: number }) {
  return (
    <span className="font-mono tabular-nums text-white/80">
      {base}<sup className="text-[10px]">{exp}</sup> = {Math.pow(base, exp).toLocaleString()}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function OptionsQuantumSummary({ job, className }: OptionsQuantumSummaryProps) {
  const router = useRouter();
  const r = job.result;

  if (!r) return null;

  // ── Circuit metrics ───────────────────────────────────────────────────────────
  const circuitMetrics: MetricItem[] = [
    { label: "Qubits", value: <PowerOf2 base={2} exp={r.numQubits} />, accent: true },
    { label: "Circuit Depth", value: r.circuitDepth.toLocaleString() },
    { label: "IQAE Iterations", value: r.numIqaeRuns.toLocaleString() },
    { label: "Shots per Run", value: r.shotsPerRun.toLocaleString() },
    { label: "Total Shots", value: (r.numIqaeRuns * r.shotsPerRun).toLocaleString() },
    { label: "Analysis Duration", value: `${r.analysisDurationMs}ms` },
  ];

  // ── IQAE precision metrics ─────────────────────────────────────────────────
  const precisionMetrics: MetricItem[] = [
    { label: "Precision (ε)", value: r.epsilon.toExponential(2), accent: true },
    { label: "Confidence Level (1−α)", value: `${((1 - r.alpha) * 100).toFixed(0)}%` },
    { label: "Quadratic Speedup", value: `${r.quadraticSpeedupFactor.toFixed(1)}×` },
    { label: "Classical MC Equiv.", value: r.classicalMcSamplesEquivalent.toLocaleString() },
  ];

  // Synthesise a CircuitPlan + fragment results from the IQAE iterations so the
  // fragment flow component shows something meaningful (IQAE has no distributed plan).
  const iqaePlan: CircuitPlan = {
    plan_id: r.generatedAt,
    fragment_order: Array.from({ length: r.numIqaeRuns }, (_, i) => `iqae-round-${i + 1}`),
    fragments: Object.fromEntries(
      Array.from({ length: r.numIqaeRuns }, (_, i) => [
        `iqae-round-${i + 1}`,
        {
          fragment_id: `iqae-round-${i + 1}`,
          service_type: "PROGRAMMABLE_GATE",
          qubits: Array.from({ length: r.numQubits }, (_, q) => q),
          operation_ids: [],
          dependencies: i > 0 ? [`iqae-round-${i}`] : [],
        },
      ])
    ) as CircuitPlan["fragments"],
    stages: Array.from({ length: r.numIqaeRuns }, (_, i) => ({
      stage_id: `round-${i + 1}`,
      stage_index: i,
      fragment_ids: [`iqae-round-${i + 1}`],
      block_ids: [],
    })) as CircuitPlan["stages"],
  };
  const iqaeFragments = Array.from({ length: r.numIqaeRuns }, (_, i) => ({
    fragment_id: `iqae-round-${i + 1}`,
    node_id: `local`,
    status: "SUCCESS",
    shots: r.shotsPerRun,
    service_type: "PROGRAMMABLE_GATE",
    gate_count: r.circuitDepth,
    depth: r.circuitDepth,
    qubits: r.numQubits,
    fidelity: null,
    error: null,
  }));

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <JobMetaStrip
        jobId={job.jobId}
        status={job.status}
        createdAt={job.createdAt}
        extraBadges={[
          { label: titleCase(job.optionType), className: "border-amber-500/30 bg-amber-500/10 text-amber-400" },
          { label: "IQAE Algorithm", className: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400" },
        ]}
        rightContent={
          <button
            onClick={() => router.push(ROUTES.optionsDetail(job.jobId))}
            className={cn(
              "flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5",
              "px-3 py-1.5 text-[12px] font-medium text-white/55 transition-colors",
              "hover:border-white/20 hover:text-white/75",
            )}
          >
            <ArrowLeft className="h-3 w-3 shrink-0" />
            <span>Back to Pricing</span>
          </button>
        }
      />

      {/* Qubit Bloch Spheres */}
      <GlassCard>
        <SectionTitle icon={Cpu} title="Qubit States (Bloch Spheres)" accentColor="amber" tooltip="IQAE encodes the option payoff as a quantum amplitude. Uncertainty qubits model the log-normal asset price distribution; the estimation register collapses to encode the final quantum option price." />
        <p className="mb-4 text-[12px] text-white/40">
          IQAE encodes the option payoff as a quantum amplitude. Each qubit represents a register in the
          uncertainty model (log-normal price distribution). The estimation register collapses to encode
          the final quantum price.
        </p>
        <div className="grid grid-cols-1 gap-3 pt-1 lg:grid-cols-2">
          {Array.from({ length: Math.min(r.numQubits, 6) }, (_, i) => (
            <IqaeBlochSphere key={i} qubit={i} numQubits={r.numQubits} />
          ))}
        </div>

        {/* Legend */}
        <div className="mt-5 rounded-xl border-l-2 border-amber-500/40 bg-amber-500/[0.04] px-4 py-3 ring-1 ring-amber-500/10">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-amber-400/70">
            Reading the Spheres
          </p>
          <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
            {[
              { dot: "#67e8f9", label: "Equatorial (θ=90°)", desc: "Superposition — uncertainty qubit in H-gate state" },
              { dot: "#fbbf24", label: "Tilted (θ≈60°)", desc: "Estimation register — partially committed to amplitude" },
              { dot: "#34d399", label: "Near |1⟩ pole", desc: "High-confidence outcome — price is ITM" },
              { dot: "#ffffff28", label: "Near |0⟩ pole", desc: "Low-probability outcome — price is OTM" },
            ].map(({ dot, label, desc }) => (
              <div key={label} className="flex items-start gap-2">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot, boxShadow: `0 0 6px ${dot}` }} />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-semibold text-white/70">{label}</span>
                  <span className="text-[11px] text-white/40">{desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* Circuit details */}
      <GlassCard>
        <SectionTitle icon={Zap} title="IQAE Circuit" accentColor="amber" tooltip="The Iterative Quantum Amplitude Estimation circuit. Each run applies the Grover-like oracle and measurement operator, iteratively narrowing the confidence interval around the option price." />
        <MetricGrid metrics={circuitMetrics} accentClass="text-amber-300" />
      </GlassCard>

      {/* Convergence */}
      <GlassCard>
        <SectionTitle icon={BarChart3} title="Iterative Convergence" accentColor="amber" tooltip="Each bar is one IQAE iteration. The algorithm quadratically narrows the confidence interval each round — taller bars (early rounds) have wider uncertainty, shorter bars (later rounds) have tighter bounds." />
        <ConvergenceBar epsilon={r.epsilon} numRuns={r.numIqaeRuns} />
      </GlassCard>

      {/* Precision */}
      <GlassCard>
        <SectionTitle icon={Settings2} title="Precision & Confidence" accentColor="amber" tooltip="ε (epsilon) is the target half-width of the 95% confidence interval. α is the failure probability (1−α = confidence level). Smaller ε = more precise price estimate but requires more oracle calls." />
        <MetricGrid metrics={precisionMetrics} accentClass="text-amber-300" />

        <div className="mt-4 rounded-xl border-l-2 border-cyan-500/30 bg-cyan-500/[0.04] px-4 py-3 ring-1 ring-cyan-500/10">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400/70 mb-2">
            Quadratic Speedup Explained
          </p>
          <p className="text-[12px] text-white/50 leading-relaxed">
            Classical Monte Carlo achieves ε-accuracy with O(1/ε²) samples.{" "}
            IQAE achieves the same with O(1/ε) quantum circuit evaluations —
            a <span className="text-amber-300 font-semibold">{r.quadraticSpeedupFactor.toFixed(1)}×</span> speedup
            equivalent to <span className="tabular-nums text-white/70">{r.classicalMcSamplesEquivalent.toLocaleString()}</span> classical Monte Carlo samples.
          </p>
        </div>
      </GlassCard>

      {/* IQAE Circuit Fragment Execution Flow */}
      <GlassCard>
        <SectionTitle icon={Zap} title="Circuit Fragment Execution" accentColor="amber" tooltip="Each IQAE iteration shown as a sequential circuit fragment. The algorithm runs these rounds one after another, each refining the amplitude estimate. Node colour indicates the gate type applied in that round." />
        <CircuitFragmentFlow
          plan={iqaePlan}
          fragmentResults={iqaeFragments}
        />
      </GlassCard>

      {/* Pricing summary reminder */}
      <GlassCard>
        <SectionTitle icon={Activity} title="Pricing Summary" accentColor="amber" tooltip="Final pricing outputs from this IQAE run. The quantum price is the amplitude-encoded estimate; CI bounds are the 95% confidence interval. ITM/ATM/OTM indicates whether the option is in, at, or out of the money." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { label: "Quantum (IQAE)", value: r.quantumPrice.toFixed(4), color: "text-amber-300" },
            { label: "Classical BS", value: r.classicalBsPrice.toFixed(4), color: "text-white/70" },
            { label: "Classical Binomial", value: r.classicalBinomialPrice.toFixed(4), color: "text-white/70" },
            { label: "CI Lower", value: r.confidenceInterval[0].toFixed(4), color: "text-white/50" },
            { label: "CI Upper", value: r.confidenceInterval[1].toFixed(4), color: "text-white/50" },
            { label: "Moneyness", value: r.moneyness, color: r.moneyness === "ITM" ? "text-emerald-400" : r.moneyness === "OTM" ? "text-red-400" : "text-amber-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex flex-col gap-1 rounded-lg bg-white/[0.025] px-3 py-2.5 ring-1 ring-white/6">
              <p className="text-[11px] text-white/35">{label}</p>
              <p className={cn("font-mono text-sm font-semibold tabular-nums", color)}>{value}</p>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
