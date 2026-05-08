"use client";
import { useRouter } from "next/navigation";
import {
  TrendingUp, Layers, Database, Settings, AlertTriangle,
  Activity, GitBranch, Zap, CheckCircle2, XCircle, ArrowRight,
} from "lucide-react";
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
import type { FinanceJobDetail } from "../types";

interface FinanceResultSummaryProps {
  job: FinanceJobDetail;
  className?: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────
export function fmt(n: number, d = 4) {
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}
export function pct(n: number) { return `${(n * 100).toFixed(2)}%`; }
export function num(v: unknown): number | null { return typeof v === "number" ? v : null; }
export function str(v: unknown): string { return typeof v === "string" ? v : String(v ?? "—"); }
export function bool(v: unknown): boolean { return Boolean(v); }
export function obj(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>) : {};
}
export function arr(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }

// ── asset universe table ──────────────────────────────────────────────────────
type AssetRow = {
  ticker: string; selQ: boolean; selC: boolean;
  annReturn: number | null; volatility: number | null;
  sharpe: number | null; selProb: number | null;
};
const assetCols: DataTableColumn<AssetRow>[] = [
  {
    key: "ticker", header: "Asset", align: "left",
    render: (r) => (
      <span className={cn("font-medium", r.selQ ? "text-white/90" : "text-white/50")}>{r.ticker}</span>
    ),
  },
  {
    key: "selQ", header: "Quantum", align: "right", accent: true, accentClass: "text-emerald-300",
    render: (r) => r.selQ
      ? <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /><span className="text-emerald-400 font-medium text-xs">Selected</span></span>
      : <span className="text-white/20 text-[11px]">—</span>,
  },
  {
    key: "selC", header: "Classical", align: "right",
    render: (r) => r.selC
      ? <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-white/40" /><span className="text-white/60 font-medium text-xs">Selected</span></span>
      : <span className="text-white/20 text-[11px]">—</span>,
  },
  {
    key: "annReturn", header: "Ann. Return", align: "right",
    render: (r) => r.annReturn !== null
      ? <span className={cn("tabular-nums", r.annReturn >= 0 ? "text-white/70" : "text-red-400")}>{pct(r.annReturn)}</span>
      : <span className="text-white/20">—</span>,
  },
  {
    key: "volatility", header: "Volatility", align: "right",
    render: (r) => r.volatility !== null
      ? <span className="tabular-nums text-white/50">{pct(r.volatility)}</span>
      : <span className="text-white/20">—</span>,
  },
  {
    key: "sharpe", header: "Sharpe", align: "right",
    render: (r) => r.sharpe !== null
      ? <span className={cn("tabular-nums font-medium", r.sharpe >= 1 ? "text-emerald-400" : r.sharpe >= 0.5 ? "text-white/70" : "text-white/40")}>{fmt(r.sharpe, 3)}</span>
      : <span className="text-white/20">—</span>,
  },
  {
    key: "selProb", header: "QAOA Prob.", align: "right",
    render: (r) => r.selProb !== null
      ? <span className="tabular-nums text-white/40">{pct(r.selProb)}</span>
      : <span className="text-white/20">—</span>,
  },
];

type FrontierRow = { bitstring: string; assets: string; ret: string; vol: string; isQuantum: boolean };
const frontierCols: DataTableColumn<FrontierRow>[] = [
  {
    key: "bitstring", header: "Portfolio", align: "left",
    render: (r) => (
      <span className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-white/30">{r.bitstring}</span>
        {r.isQuantum && (
          <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400 ring-1 ring-emerald-500/20">Quantum</span>
        )}
      </span>
    ),
  },
  { key: "assets", header: "Assets", align: "left", render: (r) => <span className="text-xs text-white/60">{r.assets}</span> },
  { key: "ret", header: "Return", align: "right", accent: true, accentClass: "text-emerald-300" },
  { key: "vol", header: "Volatility", align: "right" },
];

// ── animated quantum details button ──────────────────────────────────────────
function QuantumDetailsButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(ROUTES.financeQuantum(jobId))}
      className="group relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-lg bg-emerald-500/8 px-2.5 text-sm font-medium text-emerald-300 ring-1 ring-emerald-500/20 transition-colors duration-150 hover:bg-emerald-500/14 hover:text-emerald-200 hover:ring-emerald-500/35 active:translate-y-px"
    >
      {/* Shimmer sweep */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-500 group-hover:translate-x-full"
      />
      <Zap className="relative h-3.5 w-3.5 shrink-0" />
      <span className="relative">Quantum Details</span>
      <ArrowRight className="relative h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" />
    </button>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export function FinanceResultSummary({ job, className }: FinanceResultSummaryProps) {
  const problemType = job.problemType ?? (job.result ? str(obj(job.result).problem_type) : null);
  const hasResult = !!job.result && problemType === "portfolio_optimization";

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <JobMetaStrip
        jobId={job.jobId}
        status={job.status}
        createdAt={job.createdAt}
        extraBadges={
          problemType
            ? [{ label: problemType, className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" }]
            : []
        }
        rightContent={hasResult ? <QuantumDetailsButton jobId={job.jobId} /> : undefined}
      />

      {hasResult ? (
        <PortfolioOptimizationFinance result={job.result!} />
      ) : !job.result && job.status !== "failed" ? (
        <GlassCard>
          <SectionTitle icon={TrendingUp} title="Analysis Results" accentColor="emerald" tooltip="Core portfolio optimization output: the optimal allocation selected by the QAOA quantum algorithm versus the classical benchmark, with risk-adjusted performance metrics." />
          <p className="text-sm text-white/35">Results will appear here once the analysis completes.</p>
        </GlassCard>
      ) : null}

      {job.error && (
        <div className="rounded-xl bg-red-500/8 px-3 py-2.5 ring-1 ring-red-500/20">
          <p className="text-sm text-red-400">{job.error}</p>
        </div>
      )}
    </div>
  );
}

function PortfolioOptimizationFinance({ result }: { result: Record<string, unknown> }) {
  const benchmark = obj(result.benchmark);
  const quantum = obj(benchmark.quantum);
  const classical = obj(benchmark.classical);
  const comparison = obj(benchmark.comparison);
  const frontier = obj(benchmark.frontier);
  const dataset = obj(result.dataset);
  const request = obj(result.request);
  const assetUniverse = arr(result.asset_universe);
  const warnings = arr(result.warnings);
  const efficientFrontier = arr(frontier.efficient_frontier);

  const qReturn = num(quantum.expected_return);
  const cReturn = num(classical.expected_return);
  const qVolatility = num(quantum.volatility);
  const returnDiff = qReturn !== null && cReturn !== null ? qReturn - cReturn : null;
  const quantileRank = num(frontier.quantum_percentile);
  const feasibleCount = num(frontier.feasible_portfolio_count);
  const quantumOnFrontier = bool(frontier.quantum_on_frontier);
  const advantageDetected = bool(comparison.quantum_advantage_detected);

  const portfolioMetrics: MetricItem[] = [
    { label: "Quantum Return", value: qReturn !== null ? pct(qReturn) : "—", accent: true },
    { label: "Classical Return", value: cReturn !== null ? pct(cReturn) : "—" },
    {
      label: "Return Advantage",
      value: returnDiff !== null
        ? <span className={returnDiff >= 0 ? "text-emerald-300" : "text-red-400"}>{returnDiff >= 0 ? "+" : ""}{pct(returnDiff)}</span>
        : "—",
    },
    { label: "Quantum Volatility", value: qVolatility !== null ? pct(qVolatility) : "—" },
  ];

  const comparisonMetrics: MetricItem[] = [
    { label: "Objective Gap", value: num(comparison.objective_gap) !== null ? fmt(num(comparison.objective_gap)!, 6) : "—" },
    { label: "Objective Ratio", value: num(comparison.objective_ratio) !== null ? fmt(num(comparison.objective_ratio)!, 4) : "—" },
    {
      label: "Asset Overlap",
      value: num(comparison.overlap_count) !== null
        ? `${num(comparison.overlap_count)} (${num(comparison.overlap_ratio) !== null ? `${(num(comparison.overlap_ratio)! * 100).toFixed(0)}%` : "—"})`
        : "—",
    },
    { label: "Feasible Prob. Mass", value: num(comparison.feasible_probability_mass) !== null ? pct(num(comparison.feasible_probability_mass)!) : "—" },
  ];

  const assetRows: AssetRow[] = assetUniverse
    .map((a) => {
      const asset = obj(a);
      return {
        ticker: str(asset.ticker),
        selQ: bool(asset.selected_quantum),
        selC: bool(asset.selected_classical),
        annReturn: num(asset.annualized_return),
        volatility: num(asset.annualized_volatility),
        sharpe: num(asset.sharpe_like),
        selProb: num(asset.selection_probability),
      };
    })
    .sort((a, b) => {
      if (a.selQ !== b.selQ) return a.selQ ? -1 : 1;
      if (a.selC !== b.selC) return a.selC ? -1 : 1;
      return (b.annReturn ?? 0) - (a.annReturn ?? 0);
    });

  const qBitstring = str(quantum.bitstring);
  const frontierRows: FrontierRow[] = efficientFrontier.map((f) => {
    const fp = obj(f);
    return {
      bitstring: str(fp.bitstring),
      assets: arr(fp.selected_assets).map(str).join(", "),
      ret: num(fp.expected_return) !== null ? pct(num(fp.expected_return)!) : "—",
      vol: num(fp.volatility) !== null ? pct(num(fp.volatility)!) : "—",
      isQuantum: str(fp.bitstring) === qBitstring,
    };
  });

  return (
    <>
      <GlassCard>
        <SectionTitle
          icon={TrendingUp}
          title="Portfolio Result"
          accentColor="emerald"
          tooltip="The optimal portfolio allocation found by QAOA, scored by annualised return, Sharpe ratio, and volatility. A higher percentile rank means the solution outperforms more random portfolios."
          badge={
            quantileRank !== null ? (
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400 ring-1 ring-emerald-500/20">
                {quantileRank.toFixed(0)}th percentile
              </span>
            ) : undefined
          }
        />
        <MetricGrid metrics={portfolioMetrics} accentClass="text-emerald-300" />
      </GlassCard>

      <GlassCard className={advantageDetected ? "ring-emerald-500/20" : ""}>
        <SectionTitle
          icon={Activity}
          title="Quantum vs Classical"
          accentColor="emerald"
          tooltip="Head-to-head comparison of the QAOA quantum portfolio versus the classical mean-variance optimizer. A positive advantage score means the quantum solution achieved a better risk-adjusted return."
          badge={
            <div className="flex items-center gap-2">
              {advantageDetected
                ? <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400 ring-1 ring-emerald-500/20">Advantage Detected</span>
                : <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/30 ring-1 ring-white/8">No Advantage</span>
              }
              {quantumOnFrontier && (
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400 ring-1 ring-emerald-500/20">On Frontier</span>
              )}
            </div>
          }
        />
        <MetricGrid metrics={comparisonMetrics} accentClass="text-emerald-300" />
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-white/6 pt-4 md:grid-cols-4">
          {[
            { label: "Optimum Probability", value: num(comparison.optimum_probability) !== null ? pct(num(comparison.optimum_probability)!) : "—" },
            { label: "Return Gap", value: num(comparison.return_gap) !== null ? fmt(num(comparison.return_gap)!, 4) : "—" },
            { label: "Variance Gap", value: num(comparison.variance_gap) !== null ? fmt(num(comparison.variance_gap)!, 6) : "—" },
            { label: "Quantum Rank", value: frontier.quantum_rank != null ? `#${frontier.quantum_rank} of ${feasibleCount ?? "?"}` : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-1">
              <p className="text-[11px] text-white/35">{label}</p>
              <p className="tabular-nums text-sm text-white/60">{value}</p>
            </div>
          ))}
        </div>
      </GlassCard>

      {assetRows.length > 0 && (
        <GlassCard>
          <SectionTitle
            icon={Layers}
            title="Asset Universe" tooltip="All assets considered in the optimization. 'Q' indicates the asset was selected by the quantum QAOA algorithm; 'C' by the classical benchmark. Sharpe ratio = excess return per unit of risk."
            accentColor="emerald"
            badge={feasibleCount !== null ? <span className="text-[11px] text-white/30">{feasibleCount} feasible portfolios</span> : undefined}
          />
          <DataTable rows={assetRows} columns={assetCols} accentClass="text-emerald-300" getRowKey={(r) => r.ticker} />
        </GlassCard>
      )}

      {frontierRows.length > 0 && (
        <GlassCard>
          <SectionTitle icon={GitBranch} title="Efficient Frontier" tooltip="The set of optimal portfolios offering the best possible expected return for each level of risk (volatility). Points on the frontier are Pareto-optimal — you cannot improve return without increasing risk." accentColor="emerald" />
          <DataTable rows={frontierRows} columns={frontierCols} accentClass="text-emerald-300" getRowKey={(r) => r.bitstring} />
        </GlassCard>
      )}

      <GlassCard>
        <SectionTitle icon={Database} title="Dataset" accentColor="emerald" tooltip="The input historical price dataset used to compute asset returns, covariances, and Sharpe ratios. Longer lookback periods give more stable estimates but may miss recent regime changes." />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Input Layout", value: str(dataset.input_layout) },
            { label: "Period Count", value: num(dataset.period_count) ?? "—" },
            { label: "Raw Assets", value: num(dataset.raw_asset_count) ?? "—" },
            { label: "Screened Assets", value: num(dataset.asset_count) ?? "—" },
            { label: "Start Date", value: str(dataset.start_date) },
            { label: "End Date", value: str(dataset.end_date) },
            { label: "Frequency", value: str(dataset.inferred_frequency) },
            { label: "Return Method", value: str(dataset.return_method).replace(/_/g, " ") },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-1">
              <p className="text-[11px] text-white/35">{label}</p>
              <p className="text-sm tabular-nums text-white/70 capitalize">{String(value)}</p>
            </div>
          ))}
        </div>
        {(num(dataset.dropped_records) ?? 0) > 0 && (
          <p className="mt-3 text-[11px] text-amber-400/70">{String(dataset.dropped_records)} records dropped during alignment</p>
        )}
        {arr(dataset.semantic_notes).length > 0 && (
          <div className="mt-3 flex flex-col gap-1 border-t border-white/6 pt-3">
            {arr(dataset.semantic_notes).map((note, i) => (
              <p key={i} className="text-[11px] text-white/35">{str(note)}</p>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/6 pt-4">
          {[
            { key: "asset_identifier_mode", label: str(dataset.asset_identifier_mode).replace(/_/g, " ") },
            { key: "asset_semantics", label: str(dataset.asset_semantics).replace(/_/g, " ") },
            { key: "benchmark_readiness", label: str(dataset.benchmark_readiness).replace(/_/g, " ") },
            ...(bool(dataset.market_comparable) ? [{ key: "market_comparable", label: "market comparable" }] : []),
          ].map(({ key, label }) => (
            <span key={key} className="rounded-full bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/30 ring-1 ring-white/6 capitalize">{label}</span>
          ))}
        </div>
      </GlassCard>

      <GlassCard>
        <SectionTitle icon={Settings} title="Run Configuration" accentColor="emerald" tooltip="The solver parameters submitted for this run: number of QAOA layers (p), optimizer type, qubit count, and risk preference. More layers generally improve solution quality at the cost of circuit depth." />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Budget (# Assets)", value: num(request.budget) ?? "—" },
            { label: "Risk Aversion", value: num(request.risk_aversion) !== null ? fmt(num(request.risk_aversion)!, 2) : "—" },
            { label: "Value Mode", value: str(request.resolved_value_mode) },
            { label: "Max Assets Considered", value: num(request.max_assets_considered) ?? "—" },
            { label: "QAOA Reps", value: num(request.qaoa_reps) ?? "—" },
            { label: "Search Steps", value: num(request.parameter_search_steps) ?? "—" },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-1">
              <p className="text-[11px] text-white/35">{label}</p>
              <p className="text-sm tabular-nums text-white/70 capitalize">{String(value)}</p>
            </div>
          ))}
        </div>
      </GlassCard>

      {warnings.length > 0 && (
        <GlassCard>
          <SectionTitle icon={AlertTriangle} title="Warnings" accentColor="amber" tooltip="Non-fatal issues detected during execution that may affect result reliability. Common causes: shallow circuit depth, optimizer convergence issues, or degenerate asset correlations." />
          <ul className="flex flex-col gap-1.5">
            {warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/70" />
                <p className="text-[12px] text-white/50">{str(w)}</p>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}
    </>
  );
}
