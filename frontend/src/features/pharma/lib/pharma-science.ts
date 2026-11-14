import type { ADMETResult, PipelineLogEntry } from "../types";

/** 1 kcal/mol in hartree: the usual "chemical accuracy" bar for VQE energies. */
export const CHEMICAL_ACCURACY_HA = 0.0016;

/** ADMET limits, mirroring backend ADMETFilter defaults (pharma/stages/stage_6.py). */
export const ADMET_RULES = {
  mw: { label: "MW", max: 500, unit: "Da" },
  logp: { label: "cLogP", max: 5, unit: "" },
  tpsa: { label: "TPSA", max: 140, unit: "Å²" },
  hbd: { label: "HBD", max: 5, unit: "" },
  hba: { label: "HBA", max: 10, unit: "" },
  sa: { label: "SA", max: 4, unit: "" },
  qed: { label: "QED", min: 0.4, unit: "" },
} as const;

/** Each property as a fraction of its limit; > 1 breaks the rule (QED is inverted so the same holds). */
export function admetLoad(a: ADMETResult) {
  return [
    { key: "MW", value: a.molecular_weight / 500, raw: a.molecular_weight.toFixed(1) },
    { key: "cLogP", value: Math.max(a.logp, 0) / 5, raw: a.logp.toFixed(2) },
    { key: "TPSA", value: a.tpsa / 140, raw: a.tpsa.toFixed(1) },
    { key: "HBD", value: a.hbd / 5, raw: String(a.hbd) },
    { key: "HBA", value: a.hba / 10, raw: String(a.hba) },
    { key: "SA", value: a.synthetic_accessibility / 4, raw: a.synthetic_accessibility.toFixed(2) },
    { key: "1−QED", value: (1 - a.qed_score) / 0.6, raw: a.qed_score.toFixed(3) },
  ];
}

export interface EvaluatedMolecule {
  iteration: number;
  smiles: string;
  dg: number;
  ciLo: number;
  ciHi: number;
  admet?: { pass: boolean; mw: number; logp: number; qed: number; sa: number };
}

export interface VqeFragmentRun {
  iteration: number;
  smiles: string;
  energy: number;
  exact: number | null;
  gapEv: number;
  qubits: number;
  peer: string;
}

export interface ScaffoldHop {
  iteration: number;
  to: string;
  reason: string;
}

const RE_ITER = /Iteration (\d+)\/(\d+)/;
const RE_SCORE = /Binding affinity: ([-\d.]+) kcal\/mol\s+confidence \[([-\d.]+), ([-\d.]+)\]\s+SMILES:(\S+)/;
const RE_ADMET = /ADMET (PASS|FAIL) — MW=([\d.]+)\s+LogP=([-\d.]+)\s+QED=([\d.]+)\s+SA=([\d.]+)/;
const RE_VQE = /^\s*(\S+): E=([-\d.]+) Ha \(exact ([-\d.]+|n\/a)\), gap=([\d.]+) eV, (\d+) qubits, computed on (\S+)/;
const RE_HOP = /Hop → (\S+)\s+reason: (.+)$/;

/** Rebuilds the per-iteration science record from the orchestrator's log lines (formats in pharma/orchestrator.py). */
export function parseScienceLog(lines: PipelineLogEntry[]) {
  let iteration = 0;
  let maxIterations = 0;
  const molecules: EvaluatedMolecule[] = [];
  const vqe: VqeFragmentRun[] = [];
  const hops: ScaffoldHop[] = [];

  for (const { message } of lines) {
    let m: RegExpMatchArray | null;
    if ((m = message.match(RE_ITER))) {
      iteration = parseInt(m[1], 10);
      maxIterations = parseInt(m[2], 10);
    } else if ((m = message.match(RE_SCORE))) {
      molecules.push({ iteration, smiles: m[4], dg: +m[1], ciLo: +m[2], ciHi: +m[3] });
    } else if ((m = message.match(RE_ADMET))) {
      const last = molecules[molecules.length - 1];
      if (last && !last.admet) last.admet = { pass: m[1] === "PASS", mw: +m[2], logp: +m[3], qed: +m[4], sa: +m[5] };
    } else if ((m = message.match(RE_VQE))) {
      vqe.push({
        iteration,
        smiles: m[1],
        energy: +m[2],
        exact: m[3] === "n/a" ? null : +m[3],
        gapEv: +m[4],
        qubits: +m[5],
        peer: m[6],
      });
    } else if ((m = message.match(RE_HOP))) {
      hops.push({ iteration, to: m[1], reason: m[2].trim() });
    }
  }
  return { molecules, vqe, hops, maxIterations };
}

/** Fragment SMILES keyed by ground-state energy (6 dp), the only field shared by descriptors and log lines. */
export function fragmentSmilesByEnergy(vqe: VqeFragmentRun[]): Map<string, string> {
  return new Map(vqe.map((v) => [v.energy.toFixed(6), v.smiles]));
}
