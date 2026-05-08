"use client";
import { useRouter } from "next/navigation";
import { TrendingUp, Cpu, Zap, Settings, AlertTriangle, Database, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  GlassCard,
  SectionTitle,
  JobMetaStrip,
  MetricGrid,
  DataTable,
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
  if (abs < 1) return "text-emerald-400";
  if (abs < 5) return "text-amber-400";
  return "text-red-400";
}

// ── Greeks table ──────────────────────────────────────────────────────────────
type GreekRow = { greek: string; quantum: string; classical: string };
const greekCols: DataTableColumn<GreekRow>[] = [
  {
    key: "greek", header: "Greek", align: "left",
    render: (r) => <span className="font-medium text-white/70">{r.greek}</span>,
  },
  { key: "quantum", header: "Quantum (IQAE)", align: "right", accent: true, accentClass: "text-amber-300" },
  { key: "classical", header: "Classical BS", align: "right" },
];

// ── Request params table ──────────────────────────────────────────────────────
type ParamRow = { param: string; value: string };
const paramCols: DataTableColumn<ParamRow>[] = [
  {
    key: "param", header: "Parameter", align: "left",
    render: (r) => <span className="text-white/60">{r.param}</span>,
  },
  { key: "value", header: "Value", align: "right", accentClass: "tabular-nums text-white/85" },
];

// ── Quantum Details button ────────────────────────────────────────────────────
function QuantumDetailsButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(ROUTES.optionsQuantum(jobId))}
      className={cn(
        "group relative flex items-center gap-1.5 overflow-hidden rounded-md",
        "border border-amber-500/25 bg-amber-500/8 px-3 py-1.5",
        "text-[12px] font-medium text-amber-400 transition-all duration-200",
        "hover:border-amber-500/50 hover:bg-amber-500/15 hover:text-amber-300",
      )}
    >
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-amber-400/12 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      <Zap className="h-3 w-3 shrink-0 animate-pulse" />
      <span>Quantum Details</span>
      <ArrowRight className="h-3 w-3 shrink-0 opacity-60 transition-transform duration-150 group-hover:translate-x-0.5" />
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function OptionsResultCard({ job, className }: OptionsResultCardProps) {
  const r = job.result;

  if (!r) {
    return (
      <GlassCard className={cn("ring-red-500/20", className)}>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant={job.status === "failed" ? "destructive" : "secondary"}>{job.status}</Badge>
          <span className="font-mono text-[11px] text-white/30">{job.jobId}</span>
        </div>
        <p className="text-sm text-white/50">
          {job.status === "failed" ? `Failed: ${job.error ?? "Unknown error"}` : "Analysis in progress…"}
        </p>
      </GlassCard>
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
        <span className="text-sm tabular-nums text-white/70">
          [{fmt(r.confidenceInterval[0], 4)}, {fmt(r.confidenceInterval[1], 4)}]
        </span>
      ),
    },
    {
      label: "Moneyness",
      value: (
        <span className={cn("font-semibold", r.moneyness === "ITM" ? "text-emerald-400" : r.moneyness === "OTM" ? "text-red-400" : "text-amber-400")}>
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
  const SKIP_KEYS = new Set(["option_type"]);
  const paramRows: ParamRow[] = Object.entries(r.request)
    .filter(([k, v]) => !SKIP_KEYS.has(k) && v !== null && v !== undefined)
    .map(([k, v]) => ({
      param: titleCase(k),
      value: typeof v === "number" ? (v < 1 && v > 0 ? fmtPct(v) : v.toLocaleString()) : String(v),
    }));

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <JobMetaStrip
        jobId={job.jobId}
        status={job.status}
        createdAt={job.createdAt}
        extraBadges={[
          { label: titleCase(job.optionType), className: "border-amber-500/30 bg-amber-500/10 text-amber-400" },
          { label: r.moneyness, className: "border-white/10 text-white/40" },
          ...(r.divergenceWarning ? [{ label: "Divergence Warning", className: "border-red-500/30 bg-red-500/10 text-red-400" }] : []),
          ...(r.sigmaZeroFallback ? [{ label: "σ=0 Fallback", className: "border-orange-500/30 bg-orange-500/10 text-orange-400" }] : []),
        ]}
        rightContent={<QuantumDetailsButton jobId={job.jobId} />}
      />

      {/* Pricing result */}
      <GlassCard>
        <SectionTitle icon={TrendingUp} title="Pricing Result" accentColor="amber" tooltip="Quantum price computed via IQAE amplitude estimation, versus classical Black-Scholes and Binomial models. The confidence interval shows the 95% precision bounds on the quantum estimate." />
        <MetricGrid metrics={pricingMetrics} accentClass="text-amber-300" />
      </GlassCard>

      {/* Greeks */}
      <GlassCard>
        <SectionTitle
          icon={Zap}
          title="Option Greeks"
          accentColor="amber"
          tooltip="Sensitivity measures: Delta (price vs underlying), Gamma (delta change rate), Vega (price vs volatility), Theta (price vs time). Quantum values use IQAE differentiation; Classical uses Black-Scholes formulae."
          badge={
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-400 ring-1 ring-amber-500/20">
              {r.quadraticSpeedupFactor.toFixed(1)}× Quantum Speedup
            </span>
          }
        />
        <DataTable
          rows={greekRows}
          columns={greekCols}
          accentClass="text-amber-300"
          getRowKey={(row) => row.greek}
        />
      </GlassCard>

      {/* Request parameters */}
      {paramRows.length > 0 && (
        <GlassCard>
          <SectionTitle icon={Settings} title="Option Parameters" accentColor="amber" tooltip="The input parameters submitted for this option pricing job. These define the option contract and underlie both the quantum IQAE computation and the classical benchmark." />
          <DataTable
            rows={paramRows}
            columns={paramCols}
            accentClass="text-amber-300"
            getRowKey={(row) => row.param}
          />
        </GlassCard>
      )}

      {/* Warnings */}
      {(r.divergenceWarning || r.sigmaZeroFallback) && (
        <GlassCard className="ring-orange-500/20 !bg-[rgba(251,146,60,0.04)]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-orange-300">Accuracy Warnings</p>
              {r.divergenceWarning && (
                <p className="text-[12px] text-white/55">
                  Divergence detected — quantum price differs significantly from classical estimate. Results may be less reliable.
                </p>
              )}
              {r.sigmaZeroFallback && (
                <p className="text-[12px] text-white/55">
                  σ=0 fallback applied — intrinsic value used because volatility is near zero.
                </p>
              )}
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
