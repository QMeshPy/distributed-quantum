"use client";
import { useRouter } from "next/navigation";
import {
  ShieldAlert, Cpu, Zap, BarChart3, ArrowRight, Database, TrendingDown,
} from "lucide-react";
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
import type { RiskJobDetail, VaRResult } from "../types";

interface RiskResultDashboardProps {
  job: RiskJobDetail;
  className?: string;
}

// ── helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number, d = 4) {
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(n: number) { return `${(n * 100).toFixed(2)}%`; }
function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── VaR table ──────────────────────────────────────────────────────────────────
const varCols: DataTableColumn<VaRResult>[] = [
  {
    key: "confidenceLevel",
    header: "Confidence",
    align: "left",
    render: (r) => <span className="font-medium text-white/70">{(r.confidenceLevel * 100).toFixed(0)}%</span>,
  },
  {
    key: "quantumVar",
    header: "Quantum VaR",
    align: "right",
    accent: true,
    accentClass: "text-rose-300",
    render: (r) => fmt(r.quantumVar),
  },
  {
    key: "classicalMcVar",
    header: "Classical MC VaR",
    align: "right",
    render: (r) => fmt(r.classicalMcVar),
  },
  {
    key: "deviationPct",
    header: "Deviation",
    align: "right",
    render: (r) => {
      const abs = Math.abs(r.deviationPct);
      const color = abs < 1 ? "text-emerald-400" : abs < 5 ? "text-amber-400" : "text-red-400";
      return <span className={color}>{r.deviationPct.toFixed(2)}%</span>;
    },
  },
  {
    key: "quantumCi",
    header: "Quantum 95% CI",
    align: "right",
    render: (r) => (
      <span className="text-[11px] text-white/35">[{fmt(r.quantumCi[0], 2)}, {fmt(r.quantumCi[1], 2)}]</span>
    ),
  },
];

// ── Holdings table ─────────────────────────────────────────────────────────────
type HoldingRow = { ticker: string; weight: string; bar: number };
const holdingCols: DataTableColumn<HoldingRow>[] = [
  {
    key: "ticker",
    header: "Asset / Loan",
    align: "left",
    render: (r) => <span className="font-medium text-white/80">{r.ticker}</span>,
  },
  {
    key: "weight",
    header: "Weight / Exposure",
    align: "right",
    accentClass: "text-rose-300 tabular-nums",
  },
  {
    key: "bar",
    header: "Allocation",
    align: "right",
    render: (r) => (
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-rose-400/60"
            style={{ width: `${Math.min(100, r.bar * 100)}%` }}
          />
        </div>
        <span className="text-[11px] text-white/40">{(r.bar * 100).toFixed(1)}%</span>
      </div>
    ),
  },
];

// ── Quantum Details button ─────────────────────────────────────────────────────
function QuantumDetailsButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(ROUTES.riskQuantum(jobId))}
      className={cn(
        "group relative flex items-center gap-1.5 overflow-hidden rounded-md",
        "border border-rose-500/25 bg-rose-500/8 px-3 py-1.5",
        "text-[12px] font-medium text-rose-400 transition-all duration-200",
        "hover:border-rose-500/50 hover:bg-rose-500/15 hover:text-rose-300",
      )}
    >
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-rose-400/12 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      <Zap className="h-3 w-3 shrink-0 animate-pulse" />
      <span>Quantum Details</span>
      <ArrowRight className="h-3 w-3 shrink-0 opacity-60 transition-transform duration-150 group-hover:translate-x-0.5" />
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function RiskResultDashboard({ job, className }: RiskResultDashboardProps) {
  const r = job.result;

  if (!r) {
    return (
      <GlassCard className={cn(job.status === "failed" ? "ring-red-500/20" : "", className)}>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant={job.status === "failed" ? "destructive" : "secondary"}>{job.status}</Badge>
          <Badge variant="outline" className="border-white/10 text-white/40">{job.riskModel}</Badge>
          <span className="font-mono text-[11px] text-white/30">{job.jobId}</span>
        </div>
        <p className="text-sm text-white/50">
          {job.status === "failed" ? `Failed: ${job.error ?? "Unknown error"}` : "Analysis in progress…"}
        </p>
      </GlassCard>
    );
  }

  // ── CVaR / loss metrics ────────────────────────────────────────────────────
  const riskMetrics: MetricItem[] = [
    { label: "Quantum CVaR 99%", value: fmt(r.quantumCvar99), accent: true },
    { label: "Classical MC CVaR 99%", value: fmt(r.classicalMcCvar99) },
    { label: "Expected Loss (EL)", value: fmt(r.expectedLoss) },
    {
      label: "Economic Capital",
      value: r.economicCapital !== null ? fmt(r.economicCapital) : "—",
    },
    {
      label: "CVaR Deviation",
      value: (() => {
        if (r.classicalMcCvar99 === 0) return "—";
        const dev = ((r.quantumCvar99 - r.classicalMcCvar99) / Math.abs(r.classicalMcCvar99)) * 100;
        const color = Math.abs(dev) < 1 ? "text-emerald-400" : Math.abs(dev) < 5 ? "text-amber-400" : "text-red-400";
        return <span className={cn("tabular-nums", color)}>{dev.toFixed(2)}%</span>;
      })(),
    },
    { label: "Quantum Speedup", value: `${r.quadraticSpeedupFactor.toFixed(1)}×` },
    { label: "Classical MC Equiv.", value: (r.classicalMcSamplesEquivalent ?? 0).toLocaleString() },
    { label: "Portfolio Size", value: `${job.portfolioSize} assets` },
  ];

  // ── Holdings ────────────────────────────────────────────────────────────────
  const holdingRows: HoldingRow[] = r.tickers.map((ticker, i) => ({
    ticker,
    weight: fmtPct(r.weights[i] ?? 0),
    bar: r.weights[i] ?? 0,
  }));

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <JobMetaStrip
        jobId={job.jobId}
        status={job.status}
        createdAt={job.createdAt}
        extraBadges={[
          { label: titleCase(job.riskModel), className: "border-rose-500/30 bg-rose-500/10 text-rose-400" },
          { label: `${job.portfolioSize} assets`, className: "border-white/10 text-white/40" },
        ]}
        rightContent={<QuantumDetailsButton jobId={job.jobId} />}
      />

      {/* CVaR / Loss overview */}
      <GlassCard>
        <SectionTitle
          icon={ShieldAlert}
          title="Risk Metrics"
          accentColor="rose"
          tooltip="Core risk outputs: CVaR (Conditional Value-at-Risk) at 99% confidence is the expected loss in the worst 1% of scenarios. Economic Capital is the buffer required to cover unexpected losses."
          badge={
            <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-400 ring-1 ring-rose-500/20">
              {r.quadraticSpeedupFactor.toFixed(1)}× Quantum Speedup
            </span>
          }
        />
        <MetricGrid metrics={riskMetrics} accentClass="text-rose-300" />
      </GlassCard>

      {/* VaR table */}
      {r.varResults.length > 0 && (
        <GlassCard>
          <SectionTitle icon={BarChart3} title="Value at Risk by Confidence Level" accentColor="rose" tooltip="VaR at multiple confidence levels: the loss threshold not exceeded with that probability under the model. Deviation shows how much the quantum IQAE estimate differs from classical Monte Carlo — lower is better." />
          <DataTable
            rows={r.varResults}
            columns={varCols}
            accentClass="text-rose-300"
            getRowKey={(row) => String(row.confidenceLevel)}
          />
        </GlassCard>
      )}

      {/* Loss distribution bars */}
      {r.lossDistributionBins.length > 1 && (
        <GlassCard>
          <SectionTitle icon={TrendingDown} title="Loss Distribution" accentColor="rose" tooltip="Histogram of simulated portfolio losses. Rose bars show the quantum IQAE distribution; grey bars show classical Monte Carlo. Alignment between the two validates the quantum estimate." />
          <p className="mb-3 text-[12px] text-white/40">
            Histogram of simulated portfolio losses — quantum vs. classical Monte Carlo.
          </p>
          <div className="flex items-end gap-px overflow-hidden rounded-lg" style={{ height: "80px" }}>
            {r.lossDistributionQuantum.slice(0, 40).map((v, i) => {
              const maxQ = Math.max(...r.lossDistributionQuantum);
              const maxC = Math.max(...r.lossDistributionClassical);
              const maxAll = Math.max(maxQ, maxC, 1);
              const qH = Math.round((v / maxAll) * 72);
              const cH = Math.round(((r.lossDistributionClassical[i] ?? 0) / maxAll) * 72);
              return (
                <div key={i} className="flex flex-1 flex-col items-center justify-end gap-px">
                  <div className="w-full rounded-sm bg-rose-400/55" style={{ height: `${qH}px` }} />
                  <div className="w-full rounded-sm bg-white/15" style={{ height: `${cH}px` }} />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm bg-rose-400/55" />
              <span className="text-[11px] text-white/40">Quantum IQAE</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm bg-white/15" />
              <span className="text-[11px] text-white/40">Classical MC</span>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Portfolio holdings */}
      {holdingRows.length > 0 && (
        <GlassCard>
          <SectionTitle icon={Database} title="Portfolio Holdings" accentColor="rose" tooltip="Assets or loans in the portfolio with their weights/exposures. The allocation bar shows relative size. For credit risk models, this shows loan principal and default probability per asset." />
          <DataTable
            rows={holdingRows}
            columns={holdingCols}
            accentClass="text-rose-300"
            getRowKey={(row) => row.ticker}
          />
        </GlassCard>
      )}

      {/* Circuit summary */}
      <GlassCard>
        <SectionTitle icon={Cpu} title="Quantum Circuit" accentColor="rose" tooltip="Technical details of the IQAE circuit used for risk computation. Higher qubit counts model more granular loss distributions; deeper circuits improve precision but increase noise sensitivity." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Qubits", value: r.numQubits.toLocaleString() },
            { label: "Circuit Depth", value: r.circuitDepth.toLocaleString() },
            { label: "IQAE Calls", value: (r.numIqaeCalls ?? 0).toLocaleString() },
            { label: "Duration", value: `${r.analysisDurationMs}ms` },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-1 rounded-lg bg-white/[0.025] px-3 py-2.5 ring-1 ring-white/6">
              <p className="text-[11px] text-white/35">{label}</p>
              <p className="tabular-nums text-sm font-semibold text-white/70">{value}</p>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
