"use client";

import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Badge } from "@/components/arc/badge/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/collapsible";
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import { CopyButton as ArcCopyButton } from "@/components/arc/copy-button/copy-button";
import { Progress } from "@/components/arc/progress/progress";
import { Wallet, TrendingUp, TrendingDown, Users, CheckCircle2, XCircle, ChevronDown, Coins, Bot, FileText, ArrowUpRight, FlaskConical, BarChart2, Cpu } from "lucide-react";
import { useState } from "react";
import { EnsAddress } from "./ens-address";

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
  return <ArcCopyButton value={text} iconOnly variant="plain" label="Copy" />;
}

// ── Wallet card ──────────────────────────────────────────────────────────────

function WalletCard({ data }: { data: WalletPayload }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mt-2 overflow-hidden rounded-2xl ring-1 ring-border"
      style={{
        background:
          "var(--surface-muted)",
      }}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/15">
          <Wallet className="h-3.5 w-3.5 text-warning" />
        </div>
        <span className="text-xs font-medium text-subtle">
          Wallet
        </span>
        <div className="ml-auto flex items-center gap-1 rounded-md bg-surface-muted px-2 py-0.5">
          <EnsAddress address={data.address} className="text-xs text-subtle" />
          <CopyButton text={data.address} />
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-border">
        <div className="flex flex-col gap-0.5 px-5 py-4">
          <span className="flex items-center gap-1.5 text-xs text-faint">
            <Coins className="h-3 w-3 text-info" /> USDC
          </span>
          <span className="mt-1 font-mono text-2xl font-medium text-foreground">
            {Number(data.usdc).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          <span className="text-xs text-faint">
            ≈ USD {Number(data.usdc).toFixed(2)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 px-5 py-4">
          <span className="flex items-center gap-1.5 text-xs text-faint">
            <div className="h-2.5 w-2.5 rounded-full bg-accent/60" /> ETH
          </span>
          <span className="mt-1 font-mono text-2xl font-medium text-foreground">
            {Number(data.eth).toFixed(6)}
          </span>
          <span className="text-xs text-faint">Ethereum mainnet</span>
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
      className="mt-2 overflow-hidden rounded-2xl ring-1 ring-border"
      style={{
        background: data.should_fund
          ? "var(--surface-muted)"
          : "var(--surface-muted)",
      }}
    >
      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${data.should_fund ?"bg-success/15" : "bg-danger/15"}`}
        >
          <Icon
            className={`h-3.5 w-3.5 ${data.should_fund ?"text-success" : "text-danger"}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-subtle">
            Proposal Analysis
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-foreground">
            {data.title}
          </p>
        </div>
        <Badge
          className={
            data.should_fund
              ? "bg-success/15 text-success border-success/20 shrink-0"
              : "bg-danger/15 text-danger border-danger/20 shrink-0"
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

      <div className="grid grid-cols-2 divide-x divide-border">
        <div className="px-5 py-4">
          <p className="text-xs text-faint">
            Funding Amount
          </p>
          <p className="mt-1 font-mono text-xl font-medium text-foreground">
            {data.funding_amount}{" "}
            <span className="text-sm text-subtle">USDC</span>
          </p>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-faint">
            Confidence
          </p>
          <p className="mt-1 font-mono text-xl font-medium text-foreground">
            {data.confidence}
            <span className="text-sm text-subtle">%</span>
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${data.confidence}%` }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
              className={`h-full rounded-full ${data.should_fund ?"bg-success" : "bg-danger"}`}
            />
          </div>
        </div>
      </div>

      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="border-t border-border"
      >
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-2.5 text-xs text-subtle transition hover:text-foreground">
          <FileText className="h-3 w-3" />
          Reasoning
          <ChevronDown
            className={`ml-auto h-3 w-3 transition-transform ${open ?"rotate-180" : ""}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="px-4 pb-4 text-xs leading-relaxed text-subtle">
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
      className="mt-2 overflow-hidden rounded-2xl ring-1 ring-border"
      style={{
        background:
          "var(--surface-muted)",
      }}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15">
          <Users className="h-3.5 w-3.5 text-accent" />
        </div>
        <span className="text-xs font-medium text-subtle">
          Marketplace
        </span>
        <Badge
          outline
          className="ml-auto border-border text-subtle text-xs"
        >
          {data.total} agent{data.total !== 1 ? "s" : ""}
        </Badge>
      </div>

      {data.agents.length === 0 ? (
        <p className="px-4 py-4 text-xs text-faint">
          No agents registered yet.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {data.agents.map((agent, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, duration: 0.25 }}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted transition-colors"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-muted text-sm">
                <Bot className="h-3.5 w-3.5 text-accent" />
              </div>
              <span className="text-sm text-foreground">{agent.agent_name}</span>
              <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-faint" />
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
      className="mt-2 overflow-hidden rounded-2xl ring-1 ring-border"
      style={{ background: "color-mix(in oklab, var(--foreground) 3%, transparent)" }}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-info/15">
          <FileText className="h-3.5 w-3.5 text-info" />
        </div>
        <span className="text-xs font-medium text-subtle">
          Proposals
        </span>
      </div>
      <div className="overflow-x-auto">
        <SortableDataTable
          caption="Proposals"
          rowKey="title"
          rows={data.proposals.map((p) => ({
            title: p.title,
            raised: p.budget_raised,
            required: p.budget_required,
            progress: Number(p.budget_required) > 0 ? Math.min(100, Math.round((Number(p.budget_raised) / Number(p.budget_required)) * 100)) : 0,
          }))}
          columns={[
            { key: "title", label: "Title", sortable: true },
            { key: "raised", label: "Raised", numeric: true },
            { key: "required", label: "Required", numeric: true },
            { key: "progress", label: "Progress", sortable: true, render: (v) => <Progress value={v as number} showValue /> },
          ]}
        />
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
      className="mt-2 overflow-hidden rounded-2xl ring-1 ring-border"
      style={{
        background:
          "var(--surface-muted)",
      }}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/15">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        </div>
        <span className="text-xs font-medium text-subtle">
          Proposal Submitted
        </span>
      </div>
      <div className="space-y-2 px-5 py-4">
        <div>
          <p className="text-xs text-faint">Title</p>
          <p className="mt-0.5 text-sm font-medium text-foreground">{data.title}</p>
        </div>
        <div>
          <p className="text-xs text-faint">Description</p>
          <p className="mt-0.5 text-xs text-foreground">{data.description}</p>
        </div>
        <div>
          <p className="text-xs text-faint">Budget</p>
          <p className="mt-0.5 font-mono text-sm font-medium text-success">
            {data.budget} <span className="text-xs font-normal text-subtle">USDC</span>
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
      className="mt-2 overflow-hidden rounded-2xl ring-1 ring-border"
      style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-muted">
          <FlaskConical className="h-3.5 w-3.5 text-success" />
        </div>
        <span className="text-xs font-medium text-subtle">
          {RESEARCH_LABELS[data.researchType]}
        </span>
        <span className="ml-auto text-xs text-faint">Running…</span>
      </div>
      <div className="px-5 py-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 3, ease: "easeInOut" }}
            className="h-full rounded-full bg-success"
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
      { label: "Compound", value: data.compound ?? "-" },
      { label: "Target", value: data.target ?? "-" },
      { label: "Binding Affinity", value: data.binding_affinity ?? "-" },
      { label: "Selectivity", value: data.selectivity ?? "-" },
      { label: "Status", value: data.status },
    ];
  } else if (data.researchType === "finance") {
    accent = "sky";
    Icon = BarChart2;
    rows = [
      { label: "Portfolio", value: data.portfolio ?? "-" },
      { label: "VaR 95%", value: data.var_95 ?? "-" },
      { label: "Sharpe Ratio", value: data.sharpe ?? "-" },
      { label: "Max Drawdown", value: data.max_drawdown ?? "-" },
      { label: "Status", value: data.status },
    ];
  } else {
    accent = "violet";
    Icon = Cpu;
    rows = [
      { label: "Circuit", value: data.circuit ?? "-" },
      { label: "Original Gates", value: String(data.original_gates ?? "-") },
      { label: "Optimized Gates", value: String(data.optimized_gates ?? "-") },
      { label: "Depth Reduction", value: data.depth_reduction ?? "-" },
      { label: "Status", value: data.status },
    ];
  }

  const accentClasses: Record<string, { bg: string; text: string; bar: string }> = {
    teal: { bg: "bg-success/15", text: "text-success", bar: "bg-success" },
    sky: { bg: "bg-info/15", text: "text-info", bar: "bg-info" },
    violet: { bg: "bg-accent/15", text: "text-accent", bar: "bg-accent" },
  };
  const ac = accentClasses[accent];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mt-2 overflow-hidden rounded-2xl ring-1 ring-border"
      style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className={"flex h-7 w-7 items-center justify-center rounded-lg" + ac.bg}>
          <Icon className={"h-3.5 w-3.5" + ac.text} />
        </div>
        <span className="text-xs font-medium text-subtle">
          {RESEARCH_LABELS[data.researchType]}, Result
        </span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center justify-between px-5 py-2.5">
            <span className="text-xs text-subtle">{row.label}</span>
            <span className={"font-mono text-xs font-medium" + ac.text}>{row.value}</span>
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
          <p className="mb-2 text-sm leading-relaxed text-foreground last:mb-0">
            {children}
          </p>
        ),
        strong: ({ children }) => (
          <strong className="font-medium text-foreground">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-foreground">{children}</em>
        ),
        // Omit `...props`, react-markdown's @types/react copy conflicts with the
        // project's Ref types when `ref` is spread onto intrinsic elements.
        code: ({ className, children }) => {
          const isBlock = className?.includes("language-");
          return isBlock ? (
            <code
              className={`${className} block overflow-x-auto rounded-lg bg-background/40 px-3 py-2.5 font-mono text-xs leading-relaxed text-warning ring-1 ring-border`}
            >
              {children}
            </code>
          ) : (
            <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-warning">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-2 rounded-lg">{children}</pre>
        ),
        ul: ({ children }) => (
          <ul className="my-1.5 space-y-0.5 pl-4 text-sm text-foreground">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="my-1.5 list-decimal space-y-0.5 pl-4 text-sm text-foreground">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="flex gap-1.5 before:content-['•'] before:text-faint">
            {children}
          </li>
        ),
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto rounded-lg ring-1 ring-border">
            <table className="w-full text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-surface-muted">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-3 py-2 text-left text-xs font-medium text-subtle">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-t border-border px-3 py-2 text-foreground">
            {children}
          </td>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-2 border-warning/40 pl-3 text-xs italic text-subtle">
            {children}
          </blockquote>
        ),
        h1: ({ children }) => (
          <h1 className="mb-1 text-base font-medium text-foreground">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-1 text-sm font-medium text-foreground">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-1 text-sm font-medium text-foreground">
            {children}
          </h3>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-warning underline underline-offset-2 transition-colors hover:text-warning"
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
