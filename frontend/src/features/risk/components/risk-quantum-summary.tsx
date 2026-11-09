"use client";
import { LinkButton } from "@/shared/components/link-button";
import { Cpu, Zap, BarChart3, ArrowLeft, ShieldAlert, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SurfaceCard,
  SectionTitle,
  JobMetaStrip,
  MetricGrid,
  type MetricItem,
} from "@/shared/components/detail";
import { ROUTES } from "@/constants";
import { CircuitFragmentFlow, type CircuitPlan } from "@/features/finance/components/circuit-fragment-flow";
import type { RiskJobDetail } from "../types";

interface RiskQuantumSummaryProps {
  job: RiskJobDetail;
  className?: string;
}

// ── helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number, d = 4) {
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}
function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── PowerOf2 ──────────────────────────────────────────────────────────────────
function PowerOf2({ base, exp }: { base: number; exp: number }) {
  return (
    <span className="font-mono tabular-nums text-foreground">
      {base}<sup className="text-xs">{exp}</sup> = {Math.pow(base, exp).toLocaleString()}
    </span>
  );
}

// ── Bloch Sphere (IQAE risk encoding) ─────────────────────────────────────────
// For risk: qubits encode correlated loss scenarios (Gaussian copula / log-normal)
// Each qubit models a different correlation tranche in the portfolio
function RiskBlochSphere({ idx, numQubits, role }: { idx: number; numQubits: number; role: "systematic" | "idiosyncratic" | "estimation" }) {
  const R = 52;
  const cx = 64;
  const cy = 68;

  const theta = role === "estimation"
    ? Math.PI * 0.3
    : role === "systematic"
    ? Math.PI / 2
    : Math.PI * 0.65;

  const dotX = cx + R * Math.sin(theta) * 0.55;
  const dotY = cy - R * Math.cos(theta);
  const dotColor = role === "estimation" ? "var(--danger)" : role === "systematic" ? "var(--accent)" : "var(--info)";
  const labelColor = dotColor;

  const roleLabel = role === "estimation"
    ? "CVaR estimation"
    : role === "systematic"
    ? "systematic risk"
    : "idiosyncratic risk";

  return (
    <div className="flex items-start gap-4 rounded-xl bg-surface-muted p-4 ring-1 ring-border">
      <div className="shrink-0">
        <svg width="128" height="150" viewBox="0 0 128 150" fill="none">
          <circle cx={cx} cy={cy} r={R} stroke="color-mix(in oklab, var(--foreground) 8%, transparent)" strokeWidth="1.5" fill="color-mix(in oklab, var(--foreground) 2%, transparent)" />
          <ellipse cx={cx} cy={cy} rx={R} ry={R * 0.26} stroke="color-mix(in oklab, var(--foreground) 7%, transparent)" strokeWidth="1" strokeDasharray="4 3" fill="none" />
          <line x1={cx} y1={cy - R - 8} x2={cx} y2={cy + R + 8} stroke="color-mix(in oklab, var(--foreground) 10%, transparent)" strokeWidth="1" />
          <line x1={cx - R * 0.7} y1={cy} x2={cx + R * 0.7} y2={cy} stroke="color-mix(in oklab, var(--foreground) 6%, transparent)" strokeWidth="1" strokeDasharray="3 2" />
          <text x={cx} y={cy - R - 12} textAnchor="middle" fontSize="11" fill="color-mix(in oklab, var(--foreground) 40%, transparent)">|1⟩</text>
          <text x={cx} y={cy + R + 20} textAnchor="middle" fontSize="11" fill="color-mix(in oklab, var(--foreground) 20%, transparent)">|0⟩</text>
          <text x={cx + R * 0.7 + 6} y={cy + 4} fontSize="10" fill="color-mix(in oklab, var(--foreground) 18%, transparent)">X</text>
          <text x={cx + 4} y={cy - R - 4} fontSize="10" fill="color-mix(in oklab, var(--foreground) 18%, transparent)">Z</text>
          <line x1={cx} y1={cy} x2={dotX} y2={dotY} stroke={dotColor} strokeWidth="2" opacity="0.75" />
          <line x1={dotX} y1={dotY} x2={dotX} y2={cy} stroke={dotColor} strokeWidth="1" strokeDasharray="3 2" opacity="0.25" />
          <circle cx={dotX} cy={dotY} r="6" fill={dotColor} opacity="0.95" />
          <circle cx={dotX} cy={dotY} r="3" fill="white" opacity="0.4" />
          <circle cx={cx} cy={cy} r="2.5" fill="color-mix(in oklab, var(--foreground) 15%, transparent)" />
        </svg>
      </div>

      <div className="flex flex-1 flex-col gap-3 pt-1">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-subtle">Q{idx}</span>
          <span className="text-sm font-medium" style={{ color: labelColor }}>{roleLabel}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-faint">Encodes</p>
          <p className="text-xs text-subtle leading-relaxed">
            {role === "estimation"
              ? "CVaR amplitude register, collapses to encode expected tail loss above VaR threshold."
              : role === "systematic"
              ? "Market-wide factor qubit, models correlated asset movements via Gaussian copula."
              : "Asset-specific shock qubit, models independent credit/equity loss events."}
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-surface-muted px-2.5 py-1.5 ring-1 ring-border">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />
          <span className="text-xs text-subtle">
            θ ≈ {Math.round((theta * 180 / Math.PI))}°, {role === "systematic" ? "equatorial superposition" : "committed amplitude"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── IQAE Convergence bar ──────────────────────────────────────────────────────
function IqaeConvergence({ numCalls }: { numCalls: number }) {
  const bars = Math.min(numCalls, 10);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-subtle">IQAE Amplitude Estimation Convergence ({numCalls} total calls)</p>
      <div className="flex items-end gap-1.5">
        {Array.from({ length: bars }, (_, i) => {
          const progress = (i + 1) / bars;
          const height = Math.round(4 + (1 - progress) * 44);
          const opacity = 0.3 + progress * 0.6;
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                className="w-7 rounded-sm"
                style={{
                  height: `${height}px`,
                  background: `color-mix(in oklab, var(--danger) ${opacity * 100}%, transparent)`,
                }}
              />
              <span className="text-xs text-faint">{i + 1}</span>
            </div>
          );
        })}
        {numCalls > 10 && (
          <span className="self-center text-xs text-faint ml-1">+{numCalls - 10} more</span>
        )}
      </div>
      <p className="text-xs text-faint">
        Each bar represents one IQAE oracle call, successive iterations narrow the CVaR confidence interval.
      </p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function RiskQuantumSummary({ job, className }: RiskQuantumSummaryProps) {
  const r = job.result;
  if (!r) return null;

  // Assign qubit roles: first n−1 are uncertainty qubits, last is estimation
  const qubitRoles = Array.from({ length: Math.min(r.numQubits, 6) }, (_, i) => {
    if (i === Math.min(r.numQubits, 6) - 1) return "estimation" as const;
    return i % 2 === 0 ? "systematic" as const : "idiosyncratic" as const;
  });

  const circuitMetrics: MetricItem[] = [
    { label: "Qubits", value: <PowerOf2 base={2} exp={r.numQubits} />, accent: true },
    { label: "Circuit Depth", value: r.circuitDepth.toLocaleString() },
    { label: "IQAE Oracle Calls", value: (r.numIqaeCalls ?? 0).toLocaleString() },
    { label: "Duration", value: `${r.analysisDurationMs}ms` },
  ];

  const precisionMetrics: MetricItem[] = [
    { label: "Quantum Speedup", value: `${r.quadraticSpeedupFactor.toFixed(1)}×`, accent: true },
    { label: "Classical MC Equiv.", value: (r.classicalMcSamplesEquivalent ?? 0).toLocaleString() },
    { label: "Quantum CVaR 99%", value: fmt(r.quantumCvar99) },
    { label: "Classical CVaR 99%", value: fmt(r.classicalMcCvar99) },
  ];

  // Synthesise a CircuitPlan from IQAE oracle calls (risk has no distributed plan).
  // Each oracle call is treated as a sequential fragment, one call per IQAE iteration.
  const numCalls = r.numIqaeCalls ?? 0;
  const iqaePlan: CircuitPlan = {
    plan_id: r.generatedAt,
    fragment_order: Array.from({ length: numCalls }, (_, i) => `oracle-call-${i + 1}`),
    fragments: Object.fromEntries(
      Array.from({ length: numCalls }, (_, i) => [
        `oracle-call-${i + 1}`,
        {
          fragment_id: `oracle-call-${i + 1}`,
          service_type: i % 3 === 0 ? "PROGRAMMABLE_GATE" : i % 3 === 1 ? "ENTANGLING_GATE" : "MEASUREMENT_GATE",
          qubits: Array.from({ length: r.numQubits }, (_, q) => q),
          operation_ids: [],
          dependencies: i > 0 ? [`oracle-call-${i}`] : [],
        },
      ])
    ) as CircuitPlan["fragments"],
    stages: Array.from({ length: numCalls }, (_, i) => ({
      stage_id: `call-${i + 1}`,
      stage_index: i,
      fragment_ids: [`oracle-call-${i + 1}`],
      block_ids: [],
    })) as CircuitPlan["stages"],
  };
  const iqaeFragments = Array.from({ length: numCalls }, (_, i) => ({
    fragment_id: `oracle-call-${i + 1}`,
    node_id: "local",
    status: "SUCCESS",
    service_type: i % 3 === 0 ? "PROGRAMMABLE_GATE" : i % 3 === 1 ? "ENTANGLING_GATE" : "MEASUREMENT_GATE",
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
          { label: titleCase(job.riskModel), className: "border-danger/30 bg-danger/10 text-danger" },
          { label: "IQAE Algorithm", className: "border-info/30 bg-info/10 text-info" },
        ]}
        rightContent={
          <LinkButton href={ROUTES.riskDetail(job.jobId)} size="sm" variant="secondary">
            <ArrowLeft className="h-3 w-3 shrink-0" />
            <span>Back to Risk</span>
          </LinkButton>
        }
      />

      {/* Bloch spheres */}
      <SurfaceCard>
        <SectionTitle icon={Cpu} title="Qubit States (Bloch Spheres)" accentColor="rose" tooltip="IQAE encodes the portfolio loss distribution as quantum amplitudes. Systematic qubits model correlated market factors (Gaussian copula); idiosyncratic qubits model independent shocks; the estimation register encodes the final CVaR value." />
        <p className="mb-4 text-xs text-subtle">
          IQAE encodes the portfolio loss distribution as quantum amplitudes.
          Systematic qubits model correlated market factors; idiosyncratic qubits
          model independent asset shocks; the estimation register collapses to the CVaR value.
        </p>
        <div className="grid grid-cols-1 gap-3 pt-1 lg:grid-cols-2">
          {qubitRoles.map((role, i) => (
            <RiskBlochSphere key={i} idx={i} numQubits={r.numQubits} role={role} />
          ))}
        </div>

        {/* Legend */}
        <div className="mt-5 rounded-xl border-l-2 border-danger/40 bg-danger/4 px-4 py-3 ring-1 ring-danger/10">
          <p className="mb-2 text-xs font-medium text-danger">
            Reading the Spheres
          </p>
          <div className="grid grid-cols-1 gap-1.5 md:grid-cols-3">
            {[
              { dot: "var(--accent)", label: "Equatorial (θ=90°)", desc: "Systematic factor qubit, full superposition over market scenarios" },
              { dot: "var(--info)", label: "Tilted (θ≈117°)", desc: "Idiosyncratic shock qubit, biased toward loss scenario" },
              { dot: "var(--danger)", label: "Committed (θ≈54°)", desc: "CVaR estimation register, amplitude encodes expected tail loss" },
            ].map(({ dot, label, desc }) => (
              <div key={label} className="flex items-start gap-2">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} />
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-foreground">{label}</span>
                  <span className="text-xs text-subtle">{desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SurfaceCard>

      {/* Circuit */}
      <SurfaceCard>
        <SectionTitle icon={Zap} title="IQAE Circuit" accentColor="rose" tooltip="The Iterative Quantum Amplitude Estimation circuit for CVaR. Each oracle call encodes the loss distribution; Grover-like iterations amplify the tail-loss amplitude, converging to the Conditional Value-at-Risk." />
        <MetricGrid metrics={circuitMetrics} accentClass="text-danger" />
      </SurfaceCard>

      {/* Convergence */}
      <SurfaceCard>
        <SectionTitle icon={BarChart3} title="Iterative Convergence" accentColor="rose" tooltip="Each bar is one IQAE oracle call. The CVaR confidence interval shrinks quadratically, early calls have high uncertainty, later calls converge to a precise tail-loss estimate." />
        <IqaeConvergence numCalls={r.numIqaeCalls ?? 0} />
      </SurfaceCard>

      {/* Speedup summary */}
      <SurfaceCard>
        <SectionTitle icon={Settings2} title="Quantum Advantage" accentColor="rose" tooltip="Classical Monte Carlo VaR scales as O(1/ε²) samples. IQAE achieves the same precision with O(1/ε) oracle calls, a quadratic speedup. The equivalent classical sample count shows what would be needed without quantum." />
        <MetricGrid metrics={precisionMetrics} accentClass="text-danger" />
        <div className="mt-4 rounded-xl border-l-2 border-info/30 bg-info/4 px-4 py-3 ring-1 ring-info/10">
          <p className="text-xs font-medium text-info mb-2">
            Quantum Risk Advantage
          </p>
          <p className="text-xs text-subtle leading-relaxed">
            Classical Monte Carlo VaR/CVaR computation scales as O(1/ε²) samples.{" "}
            IQAE achieves the same precision with O(1/ε) oracle calls,
            a <span className="text-danger font-medium">{r.quadraticSpeedupFactor.toFixed(1)}×</span> speedup
            over <span className="tabular-nums text-foreground">{(r.classicalMcSamplesEquivalent ?? 0).toLocaleString()}</span> classical samples.
          </p>
        </div>
      </SurfaceCard>

      {/* IQAE Circuit Fragment Execution Flow */}
      <SurfaceCard>
        <SectionTitle icon={Zap} title="Circuit Fragment Execution" accentColor="rose" tooltip="Each IQAE oracle call as a circuit fragment. Colour indicates gate type: programmable gates apply the loss oracle; entangling gates create superposition across scenarios; measurement gates collapse the CVaR amplitude." />
        <CircuitFragmentFlow plan={iqaePlan} fragmentResults={iqaeFragments} />
      </SurfaceCard>

      {/* Risk summary */}
      <SurfaceCard>
        <SectionTitle icon={ShieldAlert} title="Risk Summary" accentColor="rose" tooltip="Value-at-Risk (VaR) at each confidence level: the maximum loss not exceeded with that probability. E.g. VaR 99% = the loss threshold that is only exceeded 1% of the time under the model." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {r.varResults.slice(0, 4).map((v) => (
            <div key={v.confidenceLevel} className="flex flex-col gap-1 rounded-lg bg-surface-muted px-3 py-2.5 ring-1 ring-border">
              <p className="text-xs text-faint">VaR {(v.confidenceLevel * 100).toFixed(0)}%</p>
              <p className="font-mono text-sm font-medium tabular-nums text-danger">{fmt(v.quantumVar, 2)}</p>
            </div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );
}
