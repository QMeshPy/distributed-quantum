"use client";

import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Users,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Copy,
  Check,
  Coins,
  Bot,
  FileText,
  ArrowUpRight,
  FlaskConical,
  BarChart2,
  Cpu,
} from "lucide-react";
import { useState } from "react";

// ── Typed rich-content payloads ──────────────────────────────────────────────

export type WalletPayload = {
  type: "wallet";
  address: string;
  usdc: string | number;
  eth: string | number;
};

export type ProposalAnalysisPayload = {
  type: "proposal_analysis";
  title: string;
  should_fund: boolean;
  confidence: number;
  funding_amount: string | number;
  reasoning: string;
};

export type MarketplacePayload = {
  type: "marketplace";
  total: number;
  agents: Array<{ agent_name: string; agent_id?: string }>;
};

export type ProposalListPayload = {
  type: "proposal_list";
  proposals: Array<{
    title: string;
    budget_raised: string | number;
    budget_required: string | number;
    status?: string;
  }>;
};

export type ProposalCreatedPayload = {
  type: "proposal_created";
  title: string;
  description: string;
  budget: string;
};

export type ResearchProgressPayload = {
  type: "research_progress";
  researchType: "drug_discovery" | "finance" | "quantum";
  progress: number;
};

export type ResearchResultPayload = {
  type: "research_result";
  researchType: "drug_discovery" | "finance" | "quantum";
  compound?: string;
  target?: string;
  binding_affinity?: string;
  selectivity?: string;
  portfolio?: string;
  var_95?: string;
  sharpe?: string;
  max_drawdown?: string;
  circuit?: string;
  original_gates?: number;
  optimized_gates?: number;
  depth_reduction?: string;
  status: string;
};

export type RichContent =
  | WalletPayload
  | ProposalAnalysisPayload
  | MarketplacePayload
  | ProposalListPayload
  | ProposalCreatedPayload
  | ResearchProgressPayload
  | ResearchResultPayload;

// ── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-1 inline-flex items-center rounded p-0.5 text-white/30 transition hover:text-white/70"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

// ── Wallet card ──────────────────────────────────────────────────────────────

function WalletCard({ data }: { data: WalletPayload }) {
  const short = `${data.address.slice(0, 6)}…${data.address.slice(-4)}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mt-2 overflow-hidden rounded-2xl ring-1 ring-white/10"
      style={{
        background:
          "linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(16,16,24,0.9) 60%)",
      }}
    >
      <div className="flex items-center gap-2 border-b border-white/6 px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15">
          <Wallet className="h-3.5 w-3.5 text-amber-400" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Wallet
        </span>
        <div className="ml-auto flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5">
          <span className="font-mono text-[11px] text-white/50">{short}</span>
          <CopyButton text={data.address} />
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-white/6">
        <div className="flex flex-col gap-0.5 px-5 py-4">
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/30">
            <Coins className="h-3 w-3 text-sky-400/70" /> USDC
          </span>
          <span className="mt-1 font-mono text-2xl font-bold text-white">
            {Number(data.usdc).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          <span className="text-[10px] text-white/25">
            ≈ USD {Number(data.usdc).toFixed(2)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 px-5 py-4">
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/30">
            <div className="h-2.5 w-2.5 rounded-full bg-indigo-400/60" /> ETH
          </span>
          <span className="mt-1 font-mono text-2xl font-bold text-white">
            {Number(data.eth).toFixed(6)}
          </span>
          <span className="text-[10px] text-white/25">Ethereum mainnet</span>
        </div>
      </div>
    </motion.div>
  );
}

// ── Proposal analysis card ───────────────────────────────────────────────────

function ProposalAnalysisCard({ data }: { data: ProposalAnalysisPayload }) {
  const [open, setOpen] = useState(false);
  const Icon = data.should_fund ? TrendingUp : TrendingDown;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mt-2 overflow-hidden rounded-2xl ring-1 ring-white/10"
      style={{
        background: data.should_fund
          ? "linear-gradient(135deg, rgba(16,185,129,0.07) 0%, rgba(16,16,24,0.9) 60%)"
          : "linear-gradient(135deg, rgba(239,68,68,0.07) 0%, rgba(16,16,24,0.9) 60%)",
      }}
    >
      <div className="flex items-start gap-3 border-b border-white/6 px-4 py-3">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${data.should_fund ? "bg-emerald-500/15" : "bg-red-500/15"}`}
        >
          <Icon
            className={`h-3.5 w-3.5 ${data.should_fund ? "text-emerald-400" : "text-red-400"}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
            Proposal Analysis
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-white/90">
            {data.title}
          </p>
        </div>
        <Badge
          className={
            data.should_fund
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20 shrink-0"
              : "bg-red-500/15 text-red-400 border-red-500/20 shrink-0"
          }
        >
          {data.should_fund ? (
            <CheckCircle2 className="mr-1 h-3 w-3" />
          ) : (
            <XCircle className="mr-1 h-3 w-3" />
          )}
          {data.should_fund ? "Recommend" : "Skip"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 divide-x divide-white/6">
        <div className="px-5 py-4">
          <p className="text-[10px] uppercase tracking-wider text-white/30">
            Funding Amount
          </p>
          <p className="mt-1 font-mono text-xl font-bold text-white">
            {data.funding_amount}{" "}
            <span className="text-[13px] text-white/40">USDC</span>
          </p>
        </div>
        <div className="px-5 py-4">
          <p className="text-[10px] uppercase tracking-wider text-white/30">
            Confidence
          </p>
          <p className="mt-1 font-mono text-xl font-bold text-white">
            {data.confidence}
            <span className="text-[13px] text-white/40">%</span>
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/8">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${data.confidence}%` }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
              className={`h-full rounded-full ${data.should_fund ? "bg-emerald-400" : "bg-red-400"}`}
            />
          </div>
        </div>
      </div>

      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="border-t border-white/6"
      >
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-2.5 text-[11px] text-white/40 transition hover:text-white/70">
          <FileText className="h-3 w-3" />
          Reasoning
          <ChevronDown
            className={`ml-auto h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="px-4 pb-4 text-[12px] leading-relaxed text-white/60">
            {data.reasoning}
          </p>
        </CollapsibleContent>
      </Collapsible>
    </motion.div>
  );
}

// ── Marketplace card ─────────────────────────────────────────────────────────

function MarketplaceCard({ data }: { data: MarketplacePayload }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mt-2 overflow-hidden rounded-2xl ring-1 ring-white/10"
      style={{
        background:
          "linear-gradient(135deg, rgba(139,92,246,0.07) 0%, rgba(16,16,24,0.9) 60%)",
      }}
    >
      <div className="flex items-center gap-2 border-b border-white/6 px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15">
          <Users className="h-3.5 w-3.5 text-violet-400" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Marketplace
        </span>
        <Badge
          variant="outline"
          className="ml-auto border-white/10 text-white/40 text-[10px]"
        >
          {data.total} agent{data.total !== 1 ? "s" : ""}
        </Badge>
      </div>

      {data.agents.length === 0 ? (
        <p className="px-4 py-4 text-[12px] text-white/30">
          No agents registered yet.
        </p>
      ) : (
        <div className="divide-y divide-white/5">
          {data.agents.map((agent, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, duration: 0.25 }}
              className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/6 text-[13px]">
                <Bot className="h-3.5 w-3.5 text-violet-400/80" />
              </div>
              <span className="text-[13px] text-white/80">{agent.agent_name}</span>
              <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-white/20" />
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ── Proposal list card ───────────────────────────────────────────────────────

function ProposalListCard({ data }: { data: ProposalListPayload }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mt-2 overflow-hidden rounded-2xl ring-1 ring-white/10"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      <div className="flex items-center gap-2 border-b border-white/6 px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/15">
          <FileText className="h-3.5 w-3.5 text-sky-400" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Proposals
        </span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-white/6 hover:bg-transparent">
              <TableHead className="text-[10px] uppercase tracking-wider text-white/30">
                Title
              </TableHead>
              <TableHead className="text-right text-[10px] uppercase tracking-wider text-white/30">
                Raised
              </TableHead>
              <TableHead className="text-right text-[10px] uppercase tracking-wider text-white/30">
                Required
              </TableHead>
              <TableHead className="text-center text-[10px] uppercase tracking-wider text-white/30">
                Progress
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.proposals.map((p, i) => {
              const pct =
                Number(p.budget_required) > 0
                  ? Math.min(
                      100,
                      Math.round(
                        (Number(p.budget_raised) / Number(p.budget_required)) *
                          100
                      )
                    )
                  : 0;
              return (
                <TableRow key={i} className="border-white/6 hover:bg-white/[0.02]">
                  <TableCell className="max-w-[180px] truncate text-[12px] font-medium text-white/80">
                    {p.title}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[12px] text-white/60">
                    {p.budget_raised}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[12px] text-white/60">
                    {p.budget_required}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="inline-flex flex-col items-center gap-1">
                      <div className="h-1 w-16 overflow-hidden rounded-full bg-white/8">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{
                            duration: 0.6,
                            ease: "easeOut",
                            delay: i * 0.08,
                          }}
                          className="h-full rounded-full bg-sky-400"
                        />
                      </div>
                      <span className="text-[10px] text-white/30">{pct}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </motion.div>
  );
}


// ── Proposal created card ────────────────────────────────────────────────────

function ProposalCreatedCard({ data }: { data: ProposalCreatedPayload }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mt-2 overflow-hidden rounded-2xl ring-1 ring-white/10"
      style={{
        background:
          "linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(16,16,24,0.9) 60%)",
      }}
    >
      <div className="flex items-center gap-2 border-b border-white/6 px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Proposal Submitted
        </span>
      </div>
      <div className="space-y-2 px-5 py-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/30">Title</p>
          <p className="mt-0.5 text-[13px] font-semibold text-white/90">{data.title}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/30">Description</p>
          <p className="mt-0.5 text-[12px] text-white/70">{data.description}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/30">Budget</p>
          <p className="mt-0.5 font-mono text-[13px] font-bold text-emerald-400">
            {data.budget} <span className="text-[11px] font-normal text-white/40">USDC</span>
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Research progress card ───────────────────────────────────────────────────

const RESEARCH_LABELS: Record<ResearchProgressPayload["researchType"], string> = {
  drug_discovery: "Drug Discovery",
  finance: "Finance Analysis",
  quantum: "Quantum Circuit",
};

function ResearchProgressCard({ data }: { data: ResearchProgressPayload }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mt-2 overflow-hidden rounded-2xl ring-1 ring-white/10"
      style={{ background: "rgba(255,255,255,0.04)" }}
    >
      <div className="flex items-center gap-2 border-b border-white/6 px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/8">
          <FlaskConical className="h-3.5 w-3.5 text-teal-400" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          {RESEARCH_LABELS[data.researchType]}
        </span>
        <span className="ml-auto text-[11px] text-white/30">Running…</span>
      </div>
      <div className="px-5 py-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/8">
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 3, ease: "easeInOut" }}
            className="h-full rounded-full bg-teal-400"
          />
        </div>
      </div>
    </motion.div>
  );
}

// ── Research result card ─────────────────────────────────────────────────────

type MetricRow = { label: string; value: string };

function ResearchResultCard({ data }: { data: ResearchResultPayload }) {
  let accent = "teal";
  let rows: MetricRow[] = [];
  let Icon = FlaskConical;

  if (data.researchType === "drug_discovery") {
    accent = "teal";
    Icon = FlaskConical;
    rows = [
      { label: "Compound", value: data.compound ?? "—" },
      { label: "Target", value: data.target ?? "—" },
      { label: "Binding Affinity", value: data.binding_affinity ?? "—" },
      { label: "Selectivity", value: data.selectivity ?? "—" },
      { label: "Status", value: data.status },
    ];
  } else if (data.researchType === "finance") {
    accent = "sky";
    Icon = BarChart2;
    rows = [
      { label: "Portfolio", value: data.portfolio ?? "—" },
      { label: "VaR 95%", value: data.var_95 ?? "—" },
      { label: "Sharpe Ratio", value: data.sharpe ?? "—" },
      { label: "Max Drawdown", value: data.max_drawdown ?? "—" },
      { label: "Status", value: data.status },
    ];
  } else {
    accent = "violet";
    Icon = Cpu;
    rows = [
      { label: "Circuit", value: data.circuit ?? "—" },
      { label: "Original Gates", value: String(data.original_gates ?? "—") },
      { label: "Optimized Gates", value: String(data.optimized_gates ?? "—") },
      { label: "Depth Reduction", value: data.depth_reduction ?? "—" },
      { label: "Status", value: data.status },
    ];
  }

  const accentClasses: Record<string, { bg: string; text: string; bar: string }> = {
    teal: { bg: "bg-teal-500/15", text: "text-teal-400", bar: "bg-teal-400" },
    sky: { bg: "bg-sky-500/15", text: "text-sky-400", bar: "bg-sky-400" },
    violet: { bg: "bg-violet-500/15", text: "text-violet-400", bar: "bg-violet-400" },
  };
  const ac = accentClasses[accent];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mt-2 overflow-hidden rounded-2xl ring-1 ring-white/10"
      style={{ background: "rgba(255,255,255,0.04)" }}
    >
      <div className="flex items-center gap-2 border-b border-white/6 px-4 py-3">
        <div className={"flex h-7 w-7 items-center justify-center rounded-lg " + ac.bg}>
          <Icon className={"h-3.5 w-3.5 " + ac.text} />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          {RESEARCH_LABELS[data.researchType]} — Result
        </span>
      </div>
      <div className="divide-y divide-white/5">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center justify-between px-5 py-2.5">
            <span className="text-[11px] text-white/40">{row.label}</span>
            <span className={"font-mono text-[12px] font-semibold " + ac.text}>{row.value}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Markdown prose ───────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        p: ({ children }) => (
          <p className="mb-2 text-[13px] leading-relaxed text-white/85 last:mb-0">
            {children}
          </p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-white">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-white/70">{children}</em>
        ),
        code: ({ className, children, ...props }) => {
          const isBlock = className?.includes("language-");
          return isBlock ? (
            <code
              className={`${className} block overflow-x-auto rounded-lg bg-black/40 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-amber-200/80 ring-1 ring-white/6`}
              {...props}
            >
              {children}
            </code>
          ) : (
            <code
              className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[11px] text-amber-300/80"
              {...props}
            >
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-2 rounded-lg">{children}</pre>
        ),
        ul: ({ children }) => (
          <ul className="my-1.5 space-y-0.5 pl-4 text-[13px] text-white/75">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="my-1.5 list-decimal space-y-0.5 pl-4 text-[13px] text-white/75">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="flex gap-1.5 before:content-['•'] before:text-white/25">
            {children}
          </li>
        ),
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto rounded-lg ring-1 ring-white/8">
            <table className="w-full text-[12px]">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-white/5">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-white/40">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-t border-white/5 px-3 py-2 text-white/70">
            {children}
          </td>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-2 border-amber-400/40 pl-3 text-[12px] italic text-white/50">
            {children}
          </blockquote>
        ),
        h1: ({ children }) => (
          <h1 className="mb-1 text-base font-bold text-white">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-1 text-sm font-semibold text-white/90">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-1 text-[13px] font-semibold text-white/80">
            {children}
          </h3>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-amber-400/80 underline underline-offset-2 transition-colors hover:text-amber-300"
          >
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

interface RichMessageRendererProps {
  content: string;
  richContent?: RichContent;
}

export function RichMessageRenderer({
  content,
  richContent,
}: RichMessageRendererProps) {
  return (
    <AnimatePresence>
      <div>
        {content && <MarkdownContent content={content} />}
        {richContent?.type === "wallet" && <WalletCard data={richContent} />}
        {richContent?.type === "proposal_analysis" && (
          <ProposalAnalysisCard data={richContent} />
        )}
        {richContent?.type === "marketplace" && (
          <MarketplaceCard data={richContent} />
        )}
        {richContent?.type === "proposal_list" && (
          <ProposalListCard data={richContent} />
        )}
        {richContent?.type === "proposal_created" && (
          <ProposalCreatedCard data={richContent} />
        )}
        {richContent?.type === "research_progress" && (
          <ResearchProgressCard data={richContent} />
        )}
        {richContent?.type === "research_result" && (
          <ResearchResultCard data={richContent} />
        )}
      </div>
    </AnimatePresence>
  );
}
