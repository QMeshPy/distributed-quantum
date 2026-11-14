"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { PharmaCandidate, VQEDescriptor } from "../types";
import { CHEMICAL_ACCURACY_HA } from "../lib/pharma-science";
import { LigandViewer } from "./ligand-viewer";
import { Figure, OrbitalDiagram, PropertyRadar, VqeErrorPlot } from "./science-figures";

const TH = "px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-white/35";
const TD = "px-3 py-1.5 font-mono text-[11px] tabular-nums text-white/75";

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
      className="group flex w-full min-w-0 items-center gap-2 border border-white/[0.07] bg-black/30 px-2.5 py-1.5 text-left hover:border-white/15"
      aria-label="Copy SMILES"
    >
      <span className="shrink-0 text-[9.5px] uppercase tracking-wider text-white/30">SMILES</span>
      <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-white/80" title={smiles}>{smiles}</code>
      {copied ? <Check size={12} className="shrink-0 text-emerald-300" aria-hidden /> : <Copy size={12} className="shrink-0 text-white/30 group-hover:text-white/60" aria-hidden />}
    </button>
  );
}

function Ok({ ok }: { ok: boolean }) {
  return <span className={ok ? "text-emerald-300" : "text-rose-300"}>{ok ? "✓" : "✕"}</span>;
}

/** Qubit register as |b₀b₁…⟩ with set bits highlighted. */
function Bitstring({ bits }: { bits: number[] }) {
  return (
    <span className="inline-flex items-center font-mono text-[11px] text-white/40">
      |
      {bits.map((b, i) => (
        <span key={i} className={b ? "text-sky-300" : "text-white/35"}>{b}</span>
      ))}
      ⟩
    </span>
  );
}

export function CandidateDossier({
  candidate,
  fragmentNames,
  fragmentPeers,
}: {
  candidate: PharmaCandidate;
  fragmentNames: Map<string, string>;
  fragmentPeers: Record<string, string>;
}) {
  const { smiles, vqc_score: vqc, docking_pose: pose, admet, descriptors, scaffold_history: hops, rank } = candidate;
  const [lo, hi] = vqc.confidence_interval;
  const name = (d: VQEDescriptor) => fragmentNames.get(d.ground_state_energy_hartree.toFixed(6)) ?? d.fragment_id;
  const nameById = (id: string) => {
    const d = descriptors.find((x) => x.fragment_id === id);
    return d ? name(d) : id;
  };

  const admetRows = [
    { p: "Molecular weight", v: admet.molecular_weight.toFixed(1), u: "Da", rule: "≤ 500", ok: admet.molecular_weight <= 500 },
    { p: "cLogP (Crippen)", v: admet.logp.toFixed(2), u: "", rule: "≤ 5", ok: admet.logp <= 5 },
    { p: "TPSA", v: admet.tpsa.toFixed(1), u: "Å²", rule: "≤ 140", ok: admet.tpsa <= 140 },
    { p: "H-bond donors", v: String(admet.hbd), u: "", rule: "≤ 5", ok: admet.hbd <= 5 },
    { p: "H-bond acceptors", v: String(admet.hba), u: "", rule: "≤ 10", ok: admet.hba <= 10 },
    { p: "Synthetic accessibility", v: admet.synthetic_accessibility.toFixed(2), u: "", rule: "≤ 4", ok: admet.synthetic_accessibility <= 4 },
    { p: "QED", v: admet.qed_score.toFixed(3), u: "", rule: "≥ 0.4", ok: admet.qed_score >= 0.4 },
    { p: "hERG liability", v: admet.herg_risk ? "flagged" : "none", u: "", rule: "cLogP>4.5 ∧ MW>400", ok: !admet.herg_risk },
  ];

  return (
    <article className="space-y-3">
      {/* Identity strip */}
      <div className="grid border border-white/[0.07] bg-white/[0.015] md:grid-cols-[230px_1fr]">
        <div className="relative flex items-center justify-center border-b border-white/[0.06] bg-black/40 p-3 md:border-b-0 md:border-r">
          <span className="absolute left-2.5 top-2 font-mono text-[10px] text-white/40">Cpd {rank}</span>
          <LigandViewer smiles={smiles} width={200} height={160} />
        </div>
        <div className="min-w-0 space-y-3 p-4">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/35">ΔG<sub>bind</sub> (VQC)</p>
              <p className="font-mono text-[30px] font-semibold leading-none tabular-nums text-emerald-300">
                {vqc.binding_affinity_kcal.toFixed(2)}
                <span className="ml-1.5 text-[12px] font-normal text-white/35">kcal/mol</span>
              </p>
              <p className="mt-1 font-mono text-[10.5px] text-white/35">95% CI [{lo.toFixed(2)}, {hi.toFixed(2)}] · σ²<sub>shot</sub> {vqc.quantum_shot_variance.toExponential(2)}</p>
            </div>
            <dl className="grid grid-cols-3 gap-x-6 gap-y-1 font-mono text-[11px]">
              <dt className="text-white/35">E<sub>QUBO</sub></dt>
              <dt className="text-white/35">r<sub>QAOA</sub></dt>
              <dt className="text-white/35">Lipinski</dt>
              <dd className="tabular-nums text-white/85">{pose.total_qubo_energy.toFixed(2)}</dd>
              <dd className="tabular-nums text-white/85">{pose.qaoa_approximation_ratio.toFixed(3)}</dd>
              <dd className="tabular-nums text-white/85">{admet.lipinski_violations} viol.</dd>
            </dl>
            <span className={`ml-auto self-start border px-2 py-0.5 font-mono text-[10.5px] ${admet.passes ? "border-emerald-400/40 text-emerald-300" : "border-rose-400/40 text-rose-300"}`}>
              {admet.passes ? "✓ ADMET PASS" : "✕ ADMET FAIL"}
            </span>
          </div>
          <CopySmiles smiles={smiles} />
          {admet.failure_reasons.length > 0 && (
            <p className="font-mono text-[10.5px] text-rose-300/80">Rejected: {admet.failure_reasons.join("; ")}</p>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Figure panel="a" title="Drug-likeness profile" aside="fraction of limit" caption="Each property divided by its ADMET limit. The dashed ring is the limit, so a vertex outside it breaks that rule. QED is shown as (1 − QED)/0.6.">
          <div className="grid sm:grid-cols-[1fr_1.1fr]">
            <PropertyRadar admet={admet} />
            <table className="w-full self-center">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className={TH}>Property</th>
                  <th className={`${TH} text-right`}>Value</th>
                  <th className={TH}>Rule</th>
                  <th className={TH} aria-label="Pass" />
                </tr>
              </thead>
              <tbody>
                {admetRows.map((r) => (
                  <tr key={r.p} className="border-b border-white/[0.03]">
                    <td className="px-3 py-1 text-[11px] text-white/55">{r.p}</td>
                    <td className={`${TD} text-right ${r.ok ? "" : "text-rose-300"}`}>{r.v}{r.u && <span className="ml-0.5 text-white/30">{r.u}</span>}</td>
                    <td className="px-3 py-1 font-mono text-[10px] text-white/30">{r.rule}</td>
                    <td className="pr-3 text-center text-[11px]"><Ok ok={r.ok} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Figure>

        <Figure panel="b" title="Frontier molecular orbitals" aside={`${descriptors.length} fragments`} caption="HOMO and LUMO energies of each fragment from the VQE active-space calculation. Arrows show the HOMO–LUMO gap in eV. Hover a column for the chemical hardness η.">
          <OrbitalDiagram descriptors={descriptors} names={name} />
        </Figure>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1.35fr]">
        <Figure panel="c" title="VQE accuracy vs exact diagonalisation" caption={`Absolute ground-state error per fragment against exact diagonalisation of the same active space. The dashed line is chemical accuracy (1 kcal/mol ≈ ${CHEMICAL_ACCURACY_HA * 1000} mHa).`}>
          <div className="px-2 py-2">
            <VqeErrorPlot descriptors={descriptors} names={name} />
          </div>
        </Figure>

        <Figure panel="d" title="VQE fragment table" aside="ground state, Hartree">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className={TH}>Fragment</th>
                  <th className={`${TH} text-right`}>E₀ VQE</th>
                  <th className={`${TH} text-right`}>ΔE (mHa)</th>
                  <th className={`${TH} text-right`}>Gap (eV)</th>
                  <th className={`${TH} text-right`}>η (eV)</th>
                  <th className={`${TH} text-right`}>Qubits</th>
                  <th className={`${TH} text-right`}>Gates</th>
                  <th className={`${TH} text-right`}>Iter × starts</th>
                  <th className={TH}>Peer</th>
                </tr>
              </thead>
              <tbody>
                {descriptors.map((d) => {
                  const err = d.exact_energy_hartree != null ? Math.abs(d.ground_state_energy_hartree - d.exact_energy_hartree) : null;
                  return (
                    <tr key={d.fragment_id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                      <td className={`${TD} max-w-[140px] truncate text-white/90`} title={`${name(d)} (${d.fragment_id})`}>{name(d)}</td>
                      <td className={`${TD} text-right`}>{d.ground_state_energy_hartree.toFixed(6)}</td>
                      <td className={`${TD} text-right ${err != null && err > CHEMICAL_ACCURACY_HA ? "text-rose-300" : ""}`}>{err != null ? (err * 1000).toFixed(4) : "—"}</td>
                      <td className={`${TD} text-right`}>{d.homo_lumo_gap_ev.toFixed(2)}</td>
                      <td className={`${TD} text-right`}>{d.chemical_hardness_ev.toFixed(2)}</td>
                      <td className={`${TD} text-right`}>{d.qubit_count}</td>
                      <td className={`${TD} text-right`}>{d.gate_count.toLocaleString()}</td>
                      <td className={`${TD} text-right`}>{d.vqe_iterations} × {d.vqe_starts}{d.cached && <span className="ml-1 text-amber-300" title="Served from VQE cache">c</span>}</td>
                      <td className={`${TD} max-w-[150px] truncate text-white/45`} title={fragmentPeers[d.fragment_id]}>{fragmentPeers[d.fragment_id] ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Figure>
      </div>

      <Figure
        panel="e"
        title="QAOA docking solution"
        aside={`p = ${pose.qaoa_params_beta.length} · α = ${pose.dc_qaoa_alpha.toFixed(2)}`}
        caption="Fragment placements on the binding-site grid, read from the most probable QAOA bitstring. Total QUBO energy includes interaction energy plus clash and bond-geometry penalties. r is the QAOA approximation ratio."
      >
        <div className="grid gap-0 lg:grid-cols-[1.6fr_1fr]">
          <div className="overflow-x-auto lg:border-r lg:border-white/[0.05]">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className={TH}>Fragment</th>
                  <th className={TH}>Register</th>
                  <th className={`${TH} text-right`}>Site</th>
                  <th className={`${TH} text-right`}>E<sub>int</sub> (kcal/mol)</th>
                  <th className={`${TH} text-right`}>Clash</th>
                  <th className={`${TH} text-right`}>Bond</th>
                </tr>
              </thead>
              <tbody>
                {pose.fragment_placements.map((p) => (
                  <tr key={p.fragment_id} className="border-b border-white/[0.03]">
                    <td className={`${TD} max-w-[140px] truncate text-white/90`} title={p.fragment_id}>{nameById(p.fragment_id)}</td>
                    <td className="px-3 py-1.5"><Bitstring bits={p.binary_variable_assignment ?? []} /></td>
                    <td className={`${TD} text-right`}>{p.grid_site_index}</td>
                    <td className={`${TD} text-right`}>{p.interaction_energy_kcal.toFixed(2)}</td>
                    <td className={`${TD} text-right ${p.clash_penalty > 0 ? "text-amber-300" : "text-white/40"}`}>{(p.clash_penalty ?? 0).toFixed(2)}</td>
                    <td className={`${TD} text-right ${p.bond_geometry_penalty > 0 ? "text-amber-300" : "text-white/40"}`}>{(p.bond_geometry_penalty ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="grid grid-cols-2 content-start gap-x-4 gap-y-2.5 p-4 font-mono text-[11px]">
            <div><dt className="text-white/35">E<sub>QUBO</sub></dt><dd className="text-white/85">{pose.total_qubo_energy.toFixed(4)}</dd></div>
            <div><dt className="text-white/35">r (approx. ratio)</dt><dd className="text-white/85">{pose.qaoa_approximation_ratio.toFixed(4)}</dd></div>
            <div><dt className="text-white/35">β</dt><dd className="text-white/85">[{pose.qaoa_params_beta.map((b) => b.toFixed(3)).join(", ")}]</dd></div>
            <div><dt className="text-white/35">γ</dt><dd className="text-white/85">[{pose.qaoa_params_gamma.map((g) => g.toFixed(3)).join(", ")}]</dd></div>
            <div><dt className="text-white/35">DC-QAOA α</dt><dd className="text-white/85">{pose.dc_qaoa_alpha.toFixed(2)}</dd></div>
            <div><dt className="text-white/35">RMSD</dt><dd className="text-white/85">{pose.rmsd_angstrom != null ? `${pose.rmsd_angstrom.toFixed(2)} Å` : "n/a (no reference pose)"}</dd></div>
          </dl>
        </div>
      </Figure>

      {hops.length > 0 && (
        <Figure panel="f" title="Scaffold-hop lineage" aside={`${hops.length} hop${hops.length === 1 ? "" : "s"}`} caption="Each hop swaps one fragment to fix the listed ADMET failure. QAOA angles are warm-started from the parent's solution.">
          <ol className="flex gap-2 overflow-x-auto p-3">
            <li className="w-[150px] shrink-0 border border-white/[0.07] bg-black/30 p-2">
              <p className="font-mono text-[9.5px] text-white/35">seed</p>
              <LigandViewer smiles={hops[0].input_smiles} width={130} height={90} />
              <p className="truncate font-mono text-[9.5px] text-white/50" title={hops[0].input_smiles}>{hops[0].input_smiles}</p>
            </li>
            {hops.map((h) => (
              <li key={`${h.iteration}-${h.output_smiles}`} className="flex shrink-0 items-center gap-2">
                <div className="w-[90px] text-center font-mono text-[9.5px] leading-tight text-white/40">
                  <span className="block text-lg text-white/25">→</span>
                  {h.reason_for_hop}
                </div>
                <div className="w-[150px] border border-white/[0.07] bg-black/30 p-2">
                  <p className="font-mono text-[9.5px] text-white/35">iter {h.iteration + 1}</p>
                  <LigandViewer smiles={h.output_smiles} width={130} height={90} />
                  <p className="truncate font-mono text-[9.5px] text-emerald-300/80" title={h.output_smiles}>{h.output_smiles}</p>
                </div>
              </li>
            ))}
          </ol>
        </Figure>
      )}
    </article>
  );
}
