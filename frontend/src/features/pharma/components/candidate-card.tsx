"use client";

import { useState } from "react";
import { Check, Copy, GitMerge } from "lucide-react";
import type { PharmaCandidate } from "@/features/pharma/types";
import { ADMETPanel } from "./admet-panel";
import { LigandViewer } from "./ligand-viewer";

function CopySmiles({ smiles }: { smiles: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(smiles).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="group flex w-full min-w-0 items-center gap-2 rounded-md bg-white/[0.04] px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.07]"
      aria-label="Copy SMILES"
    >
      <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-white/70" title={smiles}>
        {smiles}
      </code>
      {copied ? (
        <Check size={12} className="shrink-0 text-emerald-300" aria-hidden />
      ) : (
        <Copy size={12} className="shrink-0 text-white/30 group-hover:text-white/60" aria-hidden />
      )}
    </button>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div title={hint}>
      <p className="text-[10px] text-white/35">{label}</p>
      <p className="font-mono text-[14px] tabular-nums text-white/85">{value}</p>
    </div>
  );
}

export function CandidateCard({ candidate }: { candidate: PharmaCandidate }) {
  const { smiles, vqc_score, docking_pose, scaffold_history, rank } = candidate;
  const [lo, hi] = vqc_score.confidence_interval;

  return (
    <article className="grid overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02] md:grid-cols-[240px_1fr]">
      <div className="relative flex items-center justify-center border-b border-white/[0.06] bg-[#080b12] p-4 md:border-b-0 md:border-r">
        <span className="absolute left-3 top-3 rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/50">
          #{rank}
        </span>
        <LigandViewer smiles={smiles} width={200} height={170} />
      </div>

      <div className="min-w-0 space-y-5 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] text-white/40">Binding affinity</p>
            <p className="font-mono text-[28px] font-semibold leading-none tabular-nums text-emerald-300">
              {vqc_score.binding_affinity_kcal.toFixed(2)}
              <span className="ml-1.5 text-[12px] font-normal text-white/35">kcal/mol</span>
            </p>
            <p className="mt-1 font-mono text-[11px] text-white/30">
              95% CI {lo.toFixed(2)} to {hi.toFixed(2)}
            </p>
          </div>
          <div className="flex gap-6">
            <Metric label="QUBO energy" value={docking_pose.total_qubo_energy.toFixed(2)} />
            <Metric
              label="QAOA ratio"
              value={`${(docking_pose.qaoa_approximation_ratio * 100).toFixed(1)}%`}
              hint="Approximation ratio of the QAOA docking solution"
            />
            <Metric label="DC-QAOA α" value={docking_pose.dc_qaoa_alpha.toFixed(2)} />
          </div>
        </div>

        <CopySmiles smiles={smiles} />

        <ADMETPanel admet={candidate.admet} />

        {scaffold_history.length > 0 && (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] text-white/40 hover:text-white/70">
              <GitMerge size={12} aria-hidden />
              {scaffold_history.length} scaffold hop{scaffold_history.length === 1 ? "" : "s"}
              <span className="text-white/20 group-open:hidden">show</span>
            </summary>
            <ol className="mt-2 space-y-1">
              {scaffold_history.map((hop) => (
                <li
                  key={`${hop.iteration}-${hop.output_smiles}`}
                  className="grid grid-cols-[2rem_1fr] gap-x-2 rounded-md bg-white/[0.03] px-2.5 py-1.5 text-[11px]"
                >
                  <span className="font-mono text-white/25">#{hop.iteration + 1}</span>
                  <span className="min-w-0 truncate font-mono">
                    <span className="text-white/40">{hop.input_smiles}</span>
                    <span className="mx-1.5 text-white/20">→</span>
                    <span className="text-emerald-300">{hop.output_smiles}</span>
                  </span>
                  <span className="col-start-2 text-white/30">{hop.reason_for_hop}</span>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </article>
  );
}
