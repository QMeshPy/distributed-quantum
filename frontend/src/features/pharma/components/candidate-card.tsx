import type { PharmaCandidate } from "@/features/pharma/types";
import { ADMETPanel } from "./admet-panel";
import { GitMerge } from "lucide-react";

export function CandidateCard({ candidate }: { candidate: PharmaCandidate }) {
  const { smiles, vqc_score, docking_pose, scaffold_history, rank } = candidate;

  return (
    <div className="rounded-2xl border border-border bg-surface-muted p-6 space-y-5">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-faint mb-1">
            Rank #{rank}
          </p>
          <p className="font-mono text-sm text-subtle break-all leading-relaxed">
            {smiles}
          </p>
        </div>
        <div className="text-right shrink-0 ml-6">
          <p className="text-xs text-faint mb-0.5">Binding Affinity</p>
          <p className="text-2xl font-medium text-success">
            {vqc_score.binding_affinity_kcal.toFixed(2)}
          </p>
          <p className="text-xs text-faint">kcal/mol</p>
          <p className="text-xs text-faint mt-1">
            [{vqc_score.confidence_interval[0].toFixed(1)}, {vqc_score.confidence_interval[1].toFixed(1)}]
          </p>
        </div>
      </div>

      {/* Docking metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-surface-muted border border-border p-3">
          <p className="text-xs text-faint mb-1.5">QUBO Energy</p>
          <p className="text-sm font-medium text-accent">
            {docking_pose.total_qubo_energy.toFixed(3)}
          </p>
        </div>
        <div className="rounded-lg bg-surface-muted border border-border p-3">
          <p className="text-xs text-faint mb-1.5">QAOA Approx. Ratio</p>
          <p className="text-sm font-medium text-info">
            {(docking_pose.qaoa_approximation_ratio * 100).toFixed(1)}%
          </p>
        </div>
        <div className="rounded-lg bg-surface-muted border border-border p-3">
          <p className="text-xs text-faint mb-1.5">DC-QAOA α</p>
          <p className="text-sm font-medium text-warning">
            {docking_pose.dc_qaoa_alpha.toFixed(2)}
          </p>
        </div>
      </div>

      <ADMETPanel admet={candidate.admet} />

      {scaffold_history.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <GitMerge size={12} className="text-faint" />
            <p className="text-xs font-medium text-faint">
              Scaffold Hops ({scaffold_history.length})
            </p>
          </div>
          <div className="space-y-1.5">
            {scaffold_history.map((hop, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md bg-surface-muted px-3 py-1.5 text-xs">
                <span className="shrink-0 text-faint font-mono w-5">#{hop.iteration + 1}</span>
                <span className="font-mono truncate text-subtle">{hop.input_smiles}</span>
                <span className="text-faint shrink-0">→</span>
                <span className="font-mono truncate text-success">{hop.output_smiles}</span>
                <span className="shrink-0 text-faint italic ml-auto">({hop.reason_for_hop})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
