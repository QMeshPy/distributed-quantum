import type { PharmaCandidate } from "@/features/pharma/types";
import { ADMETPanel } from "./admet-panel";
import { GitMerge } from "lucide-react";

export function CandidateCard({ candidate }: { candidate: PharmaCandidate }) {
  const { smiles, vqc_score, docking_pose, scaffold_history, rank } = candidate;

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-6 space-y-5">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-1">
            Rank #{rank}
          </p>
          <p className="font-mono text-sm text-white/60 break-all leading-relaxed">
            {smiles}
          </p>
        </div>
        <div className="text-right shrink-0 ml-6">
          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Binding Affinity</p>
          <p className="text-2xl font-semibold text-emerald-400">
            {vqc_score.binding_affinity_kcal.toFixed(2)}
          </p>
          <p className="text-[10px] text-white/30">kcal/mol</p>
          <p className="text-[10px] text-white/25 mt-1">
            [{vqc_score.confidence_interval[0].toFixed(1)}, {vqc_score.confidence_interval[1].toFixed(1)}]
          </p>
        </div>
      </div>

      {/* Docking metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-white/[0.035] border border-white/6 p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5">QUBO Energy</p>
          <p className="text-sm font-semibold text-violet-300">
            {docking_pose.total_qubo_energy.toFixed(3)}
          </p>
        </div>
        <div className="rounded-lg bg-white/[0.035] border border-white/6 p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5">QAOA Approx. Ratio</p>
          <p className="text-sm font-semibold text-sky-300">
            {(docking_pose.qaoa_approximation_ratio * 100).toFixed(1)}%
          </p>
        </div>
        <div className="rounded-lg bg-white/[0.035] border border-white/6 p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5">DC-QAOA α</p>
          <p className="text-sm font-semibold text-amber-300">
            {docking_pose.dc_qaoa_alpha.toFixed(2)}
          </p>
        </div>
      </div>

      <ADMETPanel admet={candidate.admet} />

      {scaffold_history.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <GitMerge size={12} className="text-white/25" />
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">
              Scaffold Hops ({scaffold_history.length})
            </p>
          </div>
          <div className="space-y-1.5">
            {scaffold_history.map((hop, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md bg-white/[0.03] px-3 py-1.5 text-[11px]">
                <span className="shrink-0 text-white/20 font-mono w-5">#{hop.iteration + 1}</span>
                <span className="font-mono truncate text-white/45">{hop.input_smiles}</span>
                <span className="text-white/20 shrink-0">→</span>
                <span className="font-mono truncate text-emerald-400">{hop.output_smiles}</span>
                <span className="shrink-0 text-white/25 italic ml-auto">({hop.reason_for_hop})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
