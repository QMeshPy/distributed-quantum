import { CheckCircle2, XCircle } from "lucide-react";
import type { ADMETResult } from "@/features/pharma/types";

export function ADMETPanel({ admet }: { admet: ADMETResult }) {
  const metrics = [
    { label: "MW", value: admet.molecular_weight.toFixed(1), unit: "Da", rule: "≤ 500", ok: admet.molecular_weight <= 500 },
    { label: "LogP", value: admet.logp.toFixed(2), unit: "", rule: "≤ 5", ok: admet.logp <= 5 },
    { label: "TPSA", value: admet.tpsa.toFixed(1), unit: "Å²", rule: "≤ 140", ok: admet.tpsa <= 140 },
    { label: "HBD", value: String(admet.hbd), unit: "", rule: "≤ 5", ok: admet.hbd <= 5 },
    { label: "HBA", value: String(admet.hba), unit: "", rule: "≤ 10", ok: admet.hba <= 10 },
    { label: "QED", value: admet.qed_score.toFixed(2), unit: "", rule: "≥ 0.4", ok: admet.qed_score >= 0.4 },
    { label: "SA", value: admet.synthetic_accessibility.toFixed(1), unit: "", rule: "≤ 4", ok: admet.synthetic_accessibility <= 4 },
  ];

  return (
    <section aria-label="ADMET profile">
      <div className="mb-2.5 flex items-center gap-2">
        <h4 className="text-[11px] font-medium uppercase tracking-wider text-white/40">ADMET</h4>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            admet.passes ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"
          }`}
        >
          {admet.passes ? <CheckCircle2 size={10} aria-hidden /> : <XCircle size={10} aria-hidden />}
          {admet.passes ? "Drug-like" : "Fails filters"}
        </span>
        {admet.herg_risk && (
          <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
            hERG risk
          </span>
        )}
      </div>
      <dl className="grid grid-cols-4 gap-px overflow-hidden rounded-lg bg-white/[0.06] sm:grid-cols-7">
        {metrics.map(({ label, value, unit, rule, ok }) => (
          <div key={label} className={`px-3 py-2 ${ok ? "bg-[#0b0e14]" : "bg-rose-950/40"}`}>
            <dt className="flex items-baseline justify-between gap-1 text-[10px] text-white/35">
              {label}
              <span className="text-[9px] text-white/20">{rule}</span>
            </dt>
            <dd className={`mt-0.5 font-mono text-[13px] tabular-nums ${ok ? "text-white/85" : "text-rose-300"}`}>
              {value}
              {unit && <span className="ml-0.5 text-[10px] text-white/30">{unit}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {admet.failure_reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-rose-300/80">
          {admet.failure_reasons.map((reason) => (
            <li key={reason}>· {reason}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
