"use client";
import { useRouter } from "next/navigation";
import { Cpu, Zap, BarChart3, ArrowLeft, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GlassCard,
  SectionTitle,
  JobMetaStrip,
} from "@/shared/components/detail";
import { ROUTES } from "@/constants";
import { CircuitFragmentFlow } from "@/features/finance/components/circuit-fragment-flow";
import { useRunPlan } from "../hooks/use-run-plan";
import type { RunDetail } from "../types";

interface RunQuantumSummaryProps {
  run: RunDetail;
  className?: string;
}

// ── Bloch sphere (real bloch_vectors data) ────────────────────────────────────
function RunBlochSphere({ qubitKey, bv }: { qubitKey: string; bv: Record<string, number> }) {
  const R = 52;
  const cx = 64;
  const cy = 68;

  const z = bv.z ?? 0;
  const x = bv.x ?? 0;
  const y = bv.y ?? 0;
  const theta = Math.acos(Math.max(-1, Math.min(1, z)));
  const dotX = cx + R * Math.sin(theta) * 0.55 * (x >= 0 ? 1 : -1);
  const dotY = cy - R * Math.cos(theta);

  const prob1 = (1 - z) / 2;
  const prob0 = 1 - prob1;
  const alpha = Math.sqrt(Math.max(0, prob0));
  const beta = Math.sqrt(Math.max(0, prob1));
  const thetaDeg = ((theta * 180) / Math.PI).toFixed(1);

  const dotColor = prob1 >= 0.65 ? "#34d399" : prob1 <= 0.35 ? "#ffffff28" : "#67e8f9";
  const labelColor = dotColor;
  const stateLabel = prob1 >= 0.65 ? "|1⟩ dominant" : prob1 <= 0.35 ? "|0⟩ dominant" : "|+⟩ superposition";

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
          <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">{qubitKey}</span>
          <span className="text-sm font-semibold" style={{ color: labelColor }}>{stateLabel}</span>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <p className="text-[11px] text-white/35">State Vector</p>
            <p className="font-mono text-sm text-white/75">
              |ψ⟩ ≈ {alpha.toFixed(3)}<span className="text-white/40">|0⟩</span>
              <span className="mx-1 text-white/30">+</span>
              {beta.toFixed(3)}<span className="text-white/40">|1⟩</span>
            </p>
          </div>
          <div className="flex gap-4">
            <div>
              <p className="text-[10px] text-white/30">θ (polar)</p>
              <p className="font-mono text-[12px] text-white/60">{thetaDeg}°</p>
            </div>
            <div>
              <p className="text-[10px] text-white/30">⟨Z⟩</p>
              <p className="font-mono text-[12px] text-white/60">{z.toFixed(3)}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/30">⟨X⟩</p>
              <p className="font-mono text-[12px] text-white/60">{x.toFixed(3)}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-2.5 py-1.5 ring-1 ring-white/6">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />
          <span className="text-[11px] text-white/50">
            P(|1⟩) = {(prob1 * 100).toFixed(1)}% · P(|0⟩) = {(prob0 * 100).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Observable expectations bar chart ─────────────────────────────────────────
function ObservableChart({ expectations }: { expectations: Record<string, number> }) {
  const entries = Object.entries(expectations).slice(0, 8);
  if (entries.length === 0) return null;
  const maxAbs = Math.max(...entries.map(([, v]) => Math.abs(v)), 0.01);
  return (
    <div className="flex flex-col gap-2">
      {entries.map(([op, val]) => {
        const barWidth = Math.abs(val / maxAbs) * 100;
        const isPos = val >= 0;
        const color = isPos ? "rgba(167,139,250,0.50)" : "rgba(251,113,133,0.50)";
        return (
          <div key={op} className="flex items-center gap-3">
            <span className="w-24 shrink-0 font-mono text-[11px] text-white/50">{op}</span>
            <div className="relative flex-1 h-4 overflow-hidden rounded bg-white/[0.03]">
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
              {barWidth > 0.5 && (
                <div
                  className="absolute h-full rounded"
                  style={{
                    width: `${barWidth / 2}%`,
                    background: color,
                    ...(isPos ? { left: "50%" } : { right: "50%" }),
                  }}
                />
              )}
            </div>
            <span className={cn("w-14 shrink-0 text-right font-mono text-[11px] tabular-nums", Math.abs(val) > 0.01 ? "text-white/70" : "text-white/30")}>
              {val.toFixed(3)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function RunQuantumSummary({ run, className }: RunQuantumSummaryProps) {
  const router = useRouter();
  const qr = run.result?.quantumResult;
  const blochVectors = qr?.blochVectors ?? {};
  const fragmentResults = run.result?.fragmentResults ?? [];

  const { data: plan } = useRunPlan(run.planId);

  // ── Top basis states — backend uses "basis_state" key ─────────────────────
  const topStateRows = (() => {
    // Prefer top_basis_states with the correct key
    const raw = qr?.topBasisStates ?? [];
    if (raw.length > 0) {
      return raw.slice(0, 10).map((s) => ({
        state: String(s.basis_state ?? s.state ?? s.basis ?? ""),
        probability: typeof s.probability === "number" ? s.probability : 0,
        amplitude: s.amplitude !== undefined ? String(s.amplitude) : null,
        count: typeof s.count === "number" ? s.count : null,
      }));
    }
    // Fallback to counts
    const counts = qr?.counts;
    if (counts && Object.keys(counts).length > 0) {
      const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
      return Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([state, count]) => ({
          state,
          probability: count / total,
          amplitude: null,
          count,
        }));
    }
    // Fallback to probabilities
    const probs = qr?.probabilities;
    if (probs && Object.keys(probs).length > 0) {
      return Object.entries(probs)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([state, probability]) => ({
          state,
          probability,
          amplitude: null,
          count: null,
        }));
    }
    return [];
  })();

  // ── Adapt fragment results for CircuitFragmentFlow ─────────────────────────
  const adaptedFragments = fragmentResults.map((f) => ({
    fragment_id: f.fragmentId,
    node_id: f.nodeId,
    status: f.status.toUpperCase() === "SUCCESS" ? "SUCCESS" : f.status.toUpperCase(),
    attempts: f.attempts,
    started_at: f.startedAt,
    finished_at: f.finishedAt,
    fidelity: f.observedFidelity,
    error: f.error,
    gate_count: f.gateCount,
    depth: f.circuitDepth,
    qubits: f.componentQubits,
    service_type: "PROGRAMMABLE_GATE",
    stage_index: f.stageIndex,
    state_handoff_from_node_ids: f.stateHandoffFrom,
    state_transfer_bytes: f.stateTransferBytes,
  }));

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <JobMetaStrip
        jobId={run.jobId}
        status={run.status}
        createdAt={run.createdAt}
        extraBadges={[
          ...(run.planId ? [{ label: "Distributed", className: "border-violet-500/30 bg-violet-500/10 text-violet-400" }] : []),
          { label: "Quantum Circuit", className: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400" },
        ]}
        rightContent={
          <button
            onClick={() => router.push(ROUTES.runDetail(run.jobId))}
            className={cn(
              "flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5",
              "px-3 py-1.5 text-[12px] font-medium text-white/55 transition-colors",
              "hover:border-white/20 hover:text-white/75",
            )}
          >
            <ArrowLeft className="h-3 w-3 shrink-0" />
            <span>Back to Run</span>
          </button>
        }
      />

      {/* Bloch Spheres */}
      {Object.keys(blochVectors).length > 0 ? (
        <GlassCard>
          <SectionTitle icon={Cpu} title="Qubit States (Bloch Spheres)" accentColor="violet" tooltip="Bloch vectors reconstructed from measurement outcomes or simulation. Each sphere shows the exact quantum state of one qubit after circuit execution — north pole |1⟩, south pole |0⟩, equator = superposition." />
          <p className="mb-4 text-[12px] text-white/40">
            Bloch vectors from full-state simulation. Each sphere shows the complete quantum state
            of one qubit after circuit execution. Equatorial position (z=0) means maximally mixed / entangled.
          </p>
          <div className="grid grid-cols-1 gap-3 pt-1 lg:grid-cols-2">
            {Object.entries(blochVectors).slice(0, 8).map(([key, raw]) => (
              <RunBlochSphere key={key} qubitKey={key} bv={raw as Record<string, number>} />
            ))}
          </div>

          {/* Legend */}
          <div className="mt-5 rounded-xl border-l-2 border-violet-500/40 bg-violet-500/[0.04] px-4 py-3 ring-1 ring-violet-500/10">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-violet-400/70">
              Reading the Spheres
            </p>
            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-3">
              {[
                { dot: "#34d399", label: "|1⟩ dominant (θ→0°)", desc: "Qubit collapsed to |1⟩ — north pole" },
                { dot: "#67e8f9", label: "Superposition (θ=90°)", desc: "Equal mixture — qubit is entangled or in superposition" },
                { dot: "#ffffff28", label: "|0⟩ dominant (θ→180°)", desc: "Qubit collapsed to |0⟩ — south pole" },
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
      ) : (
        <GlassCard>
          <SectionTitle icon={Cpu} title="Qubit States (Bloch Spheres)" accentColor="violet" />
          <p className="py-4 text-center text-[12px] text-white/40">
            No Bloch vector data for this run.
          </p>
        </GlassCard>
      )}

      {/* Measurement Outcomes */}
      {topStateRows.length > 0 && (
        <GlassCard>
          <SectionTitle
            icon={Activity}
            title="Measurement Outcomes"
            accentColor="violet"
            badge={
              qr?.shots ? (
                <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] text-white/40 ring-1 ring-white/8">
                  {qr.shots.toLocaleString()} shots
                </span>
              ) : undefined
            }
          />
          <div className="flex flex-col gap-1.5 pt-1">
            {topStateRows.map((row) => {
              const pct = row.probability * 100;
              return (
                <div key={row.state} className="flex items-center gap-3">
                  <span className="w-14 shrink-0 font-mono text-sm font-medium text-white/75">|{row.state}⟩</span>
                  <div className="flex-1 overflow-hidden rounded-full bg-white/[0.06]" style={{ height: "6px" }}>
                    <div
                      className="h-full rounded-full bg-violet-400/65"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right font-mono text-[12px] tabular-nums text-violet-300">
                    {pct.toFixed(2)}%
                  </span>
                  {row.count !== null && (
                    <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-white/30">
                      {row.count.toLocaleString()}
                    </span>
                  )}
                  {row.amplitude !== null && (
                    <span className="w-20 shrink-0 text-right font-mono text-[11px] tabular-nums text-white/30">
                      a={Number(row.amplitude).toFixed(3)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* Observable Expectations */}
      {qr?.observableExpectations && Object.keys(qr.observableExpectations).length > 0 && (
        <GlassCard>
          <SectionTitle icon={BarChart3} title="Observable Expectations ⟨O⟩" accentColor="violet" tooltip="Expectation values of Pauli observables measured on the final state. ⟨Z⟩ = +1 means the qubit is in |0⟩; ⟨Z⟩ = −1 means |1⟩. ⟨X⟩ and ⟨Y⟩ measure off-diagonal coherences." />
          <p className="mb-3 text-[12px] text-white/40">
            Expectation values of Pauli operators. +1 = fully |0⟩; −1 = fully |1⟩; 0 = superposition or entangled.
          </p>
          <ObservableChart expectations={qr.observableExpectations} />
        </GlassCard>
      )}

      {/* Entanglement entropy */}
      {qr?.entanglementEntropy && Object.keys(qr.entanglementEntropy).length > 0 && (
        <GlassCard>
          <SectionTitle icon={Activity} title="Entanglement Entropy" accentColor="violet" tooltip="Von Neumann entropy S(ρ) = −Tr(ρ log ρ) for each subsystem partition. S=0 means the subsystem is in a pure product state; S=log(2) ≈ 0.693 is maximally entangled with one other qubit." />
          <p className="mb-3 text-[12px] text-white/40">
            Von Neumann entropy S(ρ) per qubit subsystem. S=1 bit = maximum entanglement (Bell state); S=0 = separable.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(qr.entanglementEntropy).slice(0, 8).map(([key, val]) => {
              const s = typeof val === "number" ? val : 0;
              const isMax = s >= 0.95;
              return (
                <div key={key} className="flex flex-col gap-1 rounded-lg bg-white/[0.025] px-3 py-2.5 ring-1 ring-white/6">
                  <p className="text-[11px] text-white/35">{key}</p>
                  <p className={cn("font-mono text-sm font-semibold tabular-nums", isMax ? "text-violet-300" : "text-white/60")}>
                    {s.toFixed(4)}
                  </p>
                  {isMax && <p className="text-[10px] text-violet-400/60">max entangled</p>}
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* Circuit Fragment Flow */}
      <GlassCard>
        <SectionTitle icon={Zap} title="Circuit Fragment Execution" accentColor="violet" tooltip="Each circuit fragment executed on a quantum node in the distributed network. Results from all nodes are classically aggregated to reconstruct the full quantum state of the original circuit." />
        <CircuitFragmentFlow plan={plan ?? null} fragmentResults={adaptedFragments} />
      </GlassCard>
    </div>
  );
}
