import { CheckCircle2, XCircle } from "lucide-react";
import type { ADMETResult } from "@/features/pharma/types";

export function ADMETPanel({ admet }: { admet: ADMETResult }) {
  const metrics = [
    { label: "MW", value: admet.molecular_weight.toFixed(1), unit: "Da", ok: admet.molecular_weight <= 500 },
    { label: "LogP", value: admet.logp.toFixed(2), unit: "", ok: admet.logp <= 5 },
    { label: "TPSA", value: admet.tpsa.toFixed(1), unit: "Å²", ok: admet.tpsa <= 140 },
    { label: "HBD", value: String(admet.hbd), unit: "", ok: admet.hbd <= 5 },
    { label: "HBA", value: String(admet.hba), unit: "", ok: admet.hba <= 10 },
    { label: "QED", value: admet.qed_score.toFixed(3), unit: "", ok: admet.qed_score >= 0.4 },
    { label: "SA", value: admet.synthetic_accessibility.toFixed(2), unit: "", ok: admet.synthetic_accessibility <= 4 },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface-muted p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-medium text-faint">
          ADMET Profile
        </h3>
        <span
          className={[
            "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border",
            admet.passes
              ? "bg-success/10 border-success/25 text-success"
              : "bg-danger/10 border-danger/25 text-danger",
          ].join(" ")}
        >
          {admet.passes ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
          {admet.passes ? "Passes" : "Fails"}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {metrics.map(({ label, value, unit, ok }) => (
          <div
            key={label}
            className={[
              "rounded-lg p-3 border",
              ok
                ? "border-border bg-surface-muted"
                : "border-danger/25 bg-danger/8",
            ].join(" ")}
          >
            <p className="text-xs text-faint mb-1.5">{label}</p>
            <p className={["text-sm font-medium", ok ? "text-foreground" : "text-danger"].join(" ")}>
              {value}
              {unit && <span className="text-xs text-faint ml-0.5">{unit}</span>}
            </p>
          </div>
        ))}
      </div>
      {admet.failure_reasons.length > 0 && (
        <div className="mt-3 space-y-1">
          {admet.failure_reasons.map((r, i) => (
            <p key={i} className="text-xs text-danger flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-danger/60 shrink-0" />
              {r}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
