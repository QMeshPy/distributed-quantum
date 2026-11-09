"use client";
import { OracleEvidence } from "@/shared/components/oracle-evidence";
import { TrendingUp, Zap, Settings, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { legacyBadge } from "@/lib/legacy-badge";
import { cn } from "@/lib/utils";
import {
  SurfaceCard,
  SectionTitle,
  JobMetaStrip,
  MetricGrid,
  DataTable,
  QuantumDetailsButton,
  type MetricItem,
  type DataTableColumn,
} from "@/shared/components/detail";
import { ROUTES } from "@/constants";
import type { OptionsJobDetail } from "../types";

interface OptionsResultCardProps {
  job: OptionsJobDetail;
  className?: string;
}

// ── helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number, d = 4) {
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(n: number) { return `${(n * 100).toFixed(2)}%`; }
function fmtPctDirect(n: number) { return `${n.toFixed(2)}%`; }
function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function priceDiffColor(pct: number) {
  const abs = Math.abs(pct);
  if (abs < 1) return "text-success";
  if (abs < 5) return "text-warning";
  return "text-danger";
}

// ── Greeks table ──────────────────────────────────────────────────────────────
type GreekRow = { greek: string; quantum: string; classical: string };
const greekCols: DataTableColumn<GreekRow>[] = [
  {
    key: "greek", header: "Greek", align: "left",
    render: (r) => <span className="font-medium text-foreground">{r.greek}</span>,
  },
  { key: "quantum", header: "Quantum (IQAE)", align: "right" },
  { key: "classical", header: "Classical BS", align: "right" },
];

// ── Request params table ──────────────────────────────────────────────────────
type ParamRow = { param: string; value: string };
const paramCols: DataTableColumn<ParamRow>[] = [
  {
    key: "param", header: "Parameter", align: "left",
    render: (r) => <span className="text-subtle">{r.param}</span>,
  },
  { key: "value", header: "Value", align: "right" },
];


// ── Main component ─────────────────────────────────────────────────────────────
export function OptionsResultCard({ job, className }: OptionsResultCardProps) {
  const r = job.result;

  if (!r) {
    return (
      <SurfaceCard className={cn("ring-danger/20", className)}>
        <div className="flex items-center gap-2 mb-2">
          <Badge {...legacyBadge(job.status === "failed" ? "destructive" : "secondary")}>{job.status}</Badge>
          <span className="font-mono text-xs text-faint">{job.jobId}</span>
        </div>
        <p className="text-sm text-subtle">
          {job.status === "failed" ? `Failed: ${job.error ?? "Unknown error"}` : "Analysis in progress…"}
        </p>
      </SurfaceCard>
    );
  }

  // ── Pricing metrics ──────────────────────────────────────────────────────────
  const pricingMetrics: MetricItem[] = [
    { label: "Quantum Price (IQAE)", value: fmt(r.quantumPrice, 4), accent: true },
    { label: "Classical Black-Scholes", value: fmt(r.classicalBsPrice, 4) },
    { label: "Classical Binomial", value: fmt(r.classicalBinomialPrice, 4) },
    {
      label: "Price Diff (Q vs BS)",
      value: (
        <span className={cn("tabular-nums", priceDiffColor(r.priceDifferencePct))}>
          {fmtPctDirect(r.priceDifferencePct)}
        </span>
      ),
    },
    {
      label: "95% Confidence Interval",
      value: (
        <span className="text-sm tabular-nums text-foreground">
          [{fmt(r.confidenceInterval[0], 4)}, {fmt(r.confidenceInterval[1], 4)}]
        </span>
      ),
    },
    {
      label: "Moneyness",
      value: (
        <span className={cn("font-medium", r.moneyness === "ITM" ? "text-success" : r.moneyness === "OTM" ? "text-danger" : "text-warning")}>
          {r.moneyness} ({fmt(r.moneynessRatio, 4)})
        </span>
      ),
    },
    { label: "Quantum Speedup", value: `${r.quadraticSpeedupFactor.toFixed(1)}×` },
    { label: "Classical MC Equiv.", value: r.classicalMcSamplesEquivalent.toLocaleString() },
  ];

  // ── Greeks ────────────────────────────────────────────────────────────────────
  const greekRows: GreekRow[] = (["delta", "gamma", "vega", "theta"] as const).map((g) => ({
    greek: g.charAt(0).toUpperCase() + g.slice(1),
    quantum: fmt(r.quantumGreeks[g]),
    classical: fmt(r.classicalGreeks[g]),
  }));

  // ── Request parameters ────────────────────────────────────────────────────────
  const SKIP_KEYS = new Set(["option_type", "chainlink_price", "price_observation"]);
  const paramRows: ParamRow[] = Object.entries(r.request)
    .filter(([k, v]) => !SKIP_KEYS.has(k) && v !== null && v !== undefined)
    .map(([k, v]) => ({
      param: titleCase(k),
      value: typeof v === "number" ? (v < 1 && v > 0 ? fmtPct(v) : v.toLocaleString()) : String(v),
    }));

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <OracleEvidence provenance={r.provenance} />
      <JobMetaStrip
        jobId={job.jobId}
        status={job.status}
        createdAt={job.createdAt}
        extraBadges={[
          { label: titleCase(job.optionType), className: "border-warning/30 bg-warning/10 text-warning" },
          { label: r.moneyness, className: "border-border text-subtle" },
          ...(r.divergenceWarning ? [{ label: "Divergence Warning", className: "border-danger/30 bg-danger/10 text-danger" }] : []),
          ...(r.sigmaZeroFallback ? [{ label: "σ=0 Fallback", className: "border-warning/30 bg-warning/10 text-warning" }] : []),
        ]}
        rightContent={<QuantumDetailsButton href={ROUTES.optionsQuantum(job.jobId)} />}
      />

      {/* Pricing result */}
      <SurfaceCard>
        <SectionTitle icon={TrendingUp} title="Pricing Result" accentColor="amber" tooltip="Quantum price computed via IQAE amplitude estimation, versus classical Black-Scholes and Binomial models. The confidence interval shows the 95% precision bounds on the quantum estimate." />
        <MetricGrid metrics={pricingMetrics} accentClass="text-warning" />
      </SurfaceCard>

      {/* Greeks */}
      <SurfaceCard>
        <SectionTitle
          icon={Zap}
          title="Option Greeks"
          accentColor="amber"
          tooltip="Sensitivity measures: Delta (price vs underlying), Gamma (delta change rate), Vega (price vs volatility), Theta (price vs time). Quantum values use IQAE differentiation; Classical uses Black-Scholes formulae."
          badge={
            <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning ring-1 ring-warning/20">
              {r.quadraticSpeedupFactor.toFixed(1)}× Quantum Speedup
            </span>
          }
        />
        <DataTable
          rows={greekRows}
          columns={greekCols}
          getRowKey={(row) => row.greek}
        />
      </SurfaceCard>

      {/* Request parameters */}
      {paramRows.length > 0 && (
        <SurfaceCard>
          <SectionTitle icon={Settings} title="Option Parameters" accentColor="amber" tooltip="The input parameters submitted for this option pricing job. These define the option contract and underlie both the quantum IQAE computation and the classical benchmark." />
          <DataTable
            rows={paramRows}
            columns={paramCols}
            getRowKey={(row) => row.param}
          />
        </SurfaceCard>
      )}

      {/* Warnings */}
      {(r.divergenceWarning || r.sigmaZeroFallback) && (
        <SurfaceCard className="ring-warning/20 !bg-warning/4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-warning">Accuracy Warnings</p>
              {r.divergenceWarning && (
                <p className="text-xs text-subtle">
                  Divergence detected, quantum price differs significantly from classical estimate. Results may be less reliable.
                </p>
              )}
              {r.sigmaZeroFallback && (
                <p className="text-xs text-subtle">
                  σ=0 fallback applied, intrinsic value used because volatility is near zero.
                </p>
              )}
            </div>
          </div>
        </SurfaceCard>
      )}
    </div>
  );
}
