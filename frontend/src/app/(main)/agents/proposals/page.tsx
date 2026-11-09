"use client";

import { useState } from "react";
import {
  useProposals,
  useProposalDetail,
  useFundProposal,
  useWallet,
  ProposalCreateDialog,
  EnsAddress,
} from "@/features/agentkit";
import { ChainSelect, findChain, useChains } from "@/features/chains";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Progress } from "@/components/arc/progress/progress";
import { Input } from "@/components/arc/input/input";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import { PageHeader } from "@/shared/components/layout/page-header";
import {
  FileText, Plus, User, Calendar, DollarSign,
  Tag, Layers, Hash, CheckCircle2, Clock,
} from "lucide-react";
import type { Proposal, ProposalFragment } from "@/features/agentkit";

/* ─── helpers ─── */


const FRAG_STATUS_COLORS: Partial<Record<ProposalFragment["status"], string>> & Record<string, string> = {
  available: "border-success/30 bg-success/10 text-success",
  unclaimed: "border-success/30 bg-success/10 text-success",
  claimed:   "border-warning/30   bg-warning/10   text-warning",
  completed: "border-info/30     bg-info/10     text-info",
};

function pct(p: Proposal) {
  const req = parseFloat(p.budget_required);
  if (!req) return 0;
  return Math.min(100, Math.round((parseFloat(p.budget_raised) / req) * 100));
}

/* ─── reusable modal sub-components (same pattern as Peer Dossier) ─── */

function ModalSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-surface-muted p-3.5 ring-1 ring-border">
      <div className="flex items-center gap-2 text-subtle">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">{title}</span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function DetailField({
  label,
  value,
  mono,
  badge,
}: {
  label: string;
  value: string;
  mono?: boolean;
  badge?: "emerald" | "violet" | "sky" | "amber";
}) {
  const badgeClasses: Record<string, string> = {
    emerald: "bg-success/10 text-success ring-1 ring-success/20",
    violet:  "bg-accent/10  text-accent  ring-1 ring-accent/20",
    sky:     "bg-info/10     text-info     ring-1 ring-info/20",
    amber:   "bg-warning/10   text-warning   ring-1 ring-warning/20",
  };
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-xs text-faint">{label}</span>
      {badge ? (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${badgeClasses[badge]}`}>
          {value}
        </span>
      ) : (
        <span className={`text-right text-sm text-foreground ${mono ?"break-all font-mono text-xs" : ""}`}>
          {value}
        </span>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-muted px-3 py-2.5 ring-1 ring-border">
      <span className="text-lg font-medium tabular-nums text-foreground">{value}</span>
      <span className="text-center text-xs text-faint">{label}</span>
    </div>
  );
}

/* ─── page ─── */

export default function ProposalsPage() {
  const { data: proposals = [], isLoading } = useProposals();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: selected, isLoading: detailLoading } = useProposalDetail(selectedId);
  const [createOpen, setCreateOpen] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const fund = useFundProposal();
  const { data: wallet } = useWallet();
  const { data: chains } = useChains();
  const fundingChain = findChain(chains, wallet?.network);

  const handleFund = () => {
    if (!selectedId || !fundAmount) return;
    fund.mutate({ id: selectedId, amount: fundAmount });
    setFundAmount("");
  };

  const statusBadge = (s: Proposal["status"]): "emerald" | "violet" | "sky" | "amber" =>
    s === "active" ? "emerald" : s === "funded" || s === "in_progress" ? "violet" : s === "completed" ? "sky" : "amber";

  return (
    <div className="relative flex flex-col">

      <div className="pointer-events-none absolute inset-x-6 top-0 overflow-hidden" style={{ height: "300px" }}>
        
        
      </div>

      <PageHeader
        icon={FileText}
        title="Proposals"
        description="Fund and manage quantum research proposals."
      >
        <Button className="bg-accent hover:bg-accent text-sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Proposal
        </Button>
      </PageHeader>

      <div className="relative z-10 flex flex-col gap-6 p-6">
        <div
          className="overflow-hidden rounded-2xl ring-1 ring-border"
          style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
        >
          {isLoading ? (
            <Skeleton lines={4} className="h-32 w-full" />
          ) : (
            <SortableDataTable
              caption="Proposals"
              rowKey="proposal_id"
              emptyMessage="No proposals yet. Create the first one."
              rows={proposals.map((p) => ({ ...p, funding: pct(p) }))}
              columns={[
                { key: "title", label: "Title", sortable: true },
                { key: "status", label: "Status", sortable: true, render: (v) => <Badge outline>{v as string}</Badge> },
                { key: "funding", label: "Funding", sortable: true, render: (v) => (
                  <div className="flex items-center gap-2">
                    <Progress value={v as number} />
                    <span className="text-xs">{v as number}%</span>
                  </div>
                ) },
                { key: "deadline", label: "Deadline", sortable: true },
                { key: "proposal_id", label: "Actions", render: (v) => (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedId(v as string)}>View</Button>
                ) },
              ]}
            />
          )}
        </div>
      </div>

      <ProposalCreateDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* ═══ Proposal Detail Modal ═══ */}
      <Dialog open={!!selectedId} onOpenChange={(open) => { if (!open) { setSelectedId(null); setFundAmount(""); } }}>
        <DialogContent title="Proposal Detail">
<PageHeader
            icon={FileText}
            title="Proposal Detail"
            description="Complete proposal intelligence and funding controls."
          />

          <div className="overflow-y-auto px-4 pb-4" style={{ maxHeight: "calc(85vh - 140px)" }}>
            {detailLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-faint">Loading…</div>
            ) : selected ? (
              <div className="relative flex flex-col gap-4 pt-2">

                {/* Identity */}
                <ModalSection title="Identity" icon={Hash}>
                  <DetailField label="Title"       value={selected.title} />
                  <DetailField label="Proposal ID" value={selected.proposal_id} mono />
                  <DetailField label="Researcher"  value={selected.researcher_id} mono />
                  {selected.researcher_wallet ? (
                    <div className="flex items-start justify-between gap-3 py-1.5">
                      <span className="text-xs text-faint shrink-0">
                        Researcher wallet
                      </span>
                      <EnsAddress
                        address={selected.researcher_wallet}
                        className="text-sm text-foreground text-right"
                      />
                    </div>
                  ) : null}
                  <DetailField label="Status"      value={selected.status} badge={statusBadge(selected.status)} />
                </ModalSection>

                {(selected.funders?.length ?? 0) > 0 ? (
                  <ModalSection title="Funders" icon={User}>
                    <div className="space-y-2">
                      {selected.funders!.map((funder, idx) => (
                        <div
                          key={funder.funder_id ?? `${funder.wallet_address}-${idx}`}
                          className="flex items-center justify-between gap-3 rounded-lg bg-surface-muted px-3 py-2 ring-1 ring-border"
                        >
                          <EnsAddress
                            address={funder.wallet_address}
                            className="text-sm text-foreground"
                          />
                          {funder.amount ? (
                            <span className="text-xs text-success shrink-0">
                              {funder.amount} USDC
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </ModalSection>
                ) : null}

                {/* Proposal Draft */}
                <ModalSection title="Proposal Draft" icon={FileText}>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {selected.description}
                  </p>
                </ModalSection>

                {/* Budget */}
                <ModalSection title="Budget" icon={DollarSign}>
                  <div className="grid grid-cols-3 gap-3">
                    <MiniStat label="Required"  value={`${selected.budget_required}`} />
                    <MiniStat label="Raised"    value={`${selected.budget_raised}`} />
                    <MiniStat label="Threshold" value={`${selected.funding_threshold}`} />
                  </div>
                  <Progress value={pct(selected)} className="h-2 mt-1" />
                  <p className="text-right text-xs text-faint">{pct(selected)}% funded</p>
                </ModalSection>

                {/* Timeline */}
                <ModalSection title="Timeline" icon={Calendar}>
                  <DetailField label="Deadline" value={selected.deadline} />
                </ModalSection>

                {/* Tags */}
                {(selected.tags?.length ?? 0) > 0 && (
                  <ModalSection title="Tags" icon={Tag}>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.tags.map((tag) => (
                        <span key={tag} className="rounded-md bg-accent/10 px-2.5 py-1 text-xs text-accent ring-1 ring-accent/20">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </ModalSection>
                )}

                {/* Fragments */}
                {(selected.fragments?.length ?? 0) > 0 && (
                  <ModalSection title={`Fragments (${selected.fragments!.length})`} icon={Layers}>
                    <div className="flex flex-col gap-1.5">
                      {selected.fragments!.map((f) => (
                        <div key={f.fragment_id} className="rounded-lg bg-surface-muted px-3 py-2.5 ring-1 ring-border">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-foreground">{f.title}</span>
                            <Badge outline className={`shrink-0 text-xs ${FRAG_STATUS_COLORS[f.status]}`}>
                              {f.status}
                            </Badge>
                          </div>
                          <div className="mt-1 flex items-center gap-3">
                            <span className="font-mono text-xs text-faint">{f.fragment_id}</span>
                            <span className="text-xs text-subtle">{f.budget_allocated ?? (f.budget != null ? String(f.budget) : "-")} USDC</span>
                          </div>
                          {f.claimed_by && (
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-faint">
                              <User className="h-3 w-3" />
                              <span className="font-mono">{f.claimed_by}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ModalSection>
                )}

                {/* Fund action */}
                <ModalSection title="Fund this Proposal" icon={CheckCircle2}>
                  <ChainSelect
                    registry={chains}
                    active={fundingChain}
                    capability="aave_supply"
                    className="mb-2 w-full"
                  />
                  <div className="flex gap-2 pt-0.5">
                    <Input
                      label="Amount (USDC)" placeholder="Amount (USDC)"
                      value={fundAmount}
                      onChange={(e) => setFundAmount(e.target.value)}
                      className="border-border bg-surface-muted text-foreground placeholder:text-faint"
                    />
                    <Button
                      onClick={handleFund}
                      disabled={fund.isPending || !fundAmount}
                      className="shrink-0 bg-accent hover:bg-accent"
                    >
                      {fund.isPending ? <Clock className="h-4 w-4 animate-spin" /> : "Fund"}
                    </Button>
                  </div>
                </ModalSection>

              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
