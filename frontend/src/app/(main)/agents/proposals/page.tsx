"use client";

import { useState } from "react";
import { useProposals, useProposalDetail, useFundProposal, ProposalCreateDialog } from "@/features/agentkit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/shared/components/layout/page-header";
import {
  FileText, Plus, User, Calendar, DollarSign,
  Tag, Layers, Hash, CheckCircle2, Clock,
} from "lucide-react";
import type { Proposal, ProposalFragment } from "@/features/agentkit";

/* ─── helpers ─── */

const STATUS_COLORS: Partial<Record<Proposal["status"], string>> & Record<string, string> = {
  draft:       "border-white/10       bg-white/5        text-white/30",
  active:      "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  funded:      "border-violet-500/30  bg-violet-500/10  text-violet-400",
  in_progress: "border-amber-500/30   bg-amber-500/10   text-amber-400",
  completed:   "border-sky-500/30     bg-sky-500/10     text-sky-400",
  expired:     "border-white/10       bg-white/5        text-white/30",
  cancelled:   "border-rose-500/30    bg-rose-500/10    text-rose-400",
};

const FRAG_STATUS_COLORS: Partial<Record<ProposalFragment["status"], string>> & Record<string, string> = {
  available: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  unclaimed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  claimed:   "border-amber-500/30   bg-amber-500/10   text-amber-400",
  completed: "border-sky-500/30     bg-sky-500/10     text-sky-400",
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
    <div className="flex flex-col gap-2.5 rounded-xl bg-white/[0.02] p-3.5 ring-1 ring-white/6">
      <div className="flex items-center gap-2 text-white/40">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] font-semibold uppercase tracking-widest">{title}</span>
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
    emerald: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
    violet:  "bg-violet-500/10  text-violet-400  ring-1 ring-violet-500/20",
    sky:     "bg-sky-500/10     text-sky-400     ring-1 ring-sky-500/20",
    amber:   "bg-amber-500/10   text-amber-400   ring-1 ring-amber-500/20",
  };
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-[11px] text-white/30">{label}</span>
      {badge ? (
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${badgeClasses[badge]}`}>
          {value}
        </span>
      ) : (
        <span className={`text-right text-sm text-white/75 ${mono ? "break-all font-mono text-[11px]" : ""}`}>
          {value}
        </span>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/6">
      <span className="text-lg font-semibold tabular-nums text-white">{value}</span>
      <span className="text-center text-[10px] text-white/30">{label}</span>
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

  const handleFund = () => {
    if (!selectedId || !fundAmount) return;
    fund.mutate({ id: selectedId, amount: fundAmount });
    setFundAmount("");
  };

  const statusBadge = (s: Proposal["status"]): "emerald" | "violet" | "sky" | "amber" =>
    s === "active" ? "emerald" : s === "funded" || s === "in_progress" ? "violet" : s === "completed" ? "sky" : "amber";

  return (
    <div className="relative flex flex-col">

      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-x-6 top-0 overflow-hidden" style={{ height: "300px" }}>
        <div className="absolute h-[280px] w-[280px] rounded-full opacity-20 blur-[80px]" style={{ left: "0%",  top: "-50px", background: "radial-gradient(circle, rgba(167,139,250,0.65) 0%, transparent 70%)" }} />
        <div className="absolute h-[220px] w-[220px] rounded-full opacity-15 blur-[70px]" style={{ right: "5%", top: "-30px", background: "radial-gradient(circle, rgba(139,92,246,0.6)  0%, transparent 70%)" }} />
      </div>

      <PageHeader
        icon={FileText}
        label="AgentKit"
        title="Proposals"
        description="Fund and manage quantum research proposals."
        glow="violet"
      >
        <Button className="bg-violet-600 hover:bg-violet-700 text-sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Proposal
        </Button>
      </PageHeader>

      <div className="relative z-10 flex flex-col gap-6 p-6">
        <div
          className="overflow-hidden rounded-2xl ring-1 ring-white/8"
          style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
        >
          <Table>
            <TableHeader>
              <TableRow className="border-white/8 hover:bg-transparent">
                {["Title", "Status", "Funding", "Deadline", ""].map((h) => (
                  <TableHead key={h} className="text-[11px] font-semibold uppercase tracking-wider text-white/30">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-white/30">Loading…</TableCell>
                </TableRow>
              ) : proposals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-white/30">No proposals yet — create the first one</TableCell>
                </TableRow>
              ) : proposals.map((p) => (
                <TableRow key={p.proposal_id} className="border-white/8 transition-colors hover:bg-white/[0.03]">
                  <TableCell className="text-sm text-white/80">{p.title}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[p.status]}`}>{p.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={pct(p)} className="h-1.5 w-20" />
                      <span className="text-xs text-white/30">{pct(p)}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-white/30">{p.deadline}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedId(p.proposal_id)}
                      className="h-7 px-3 text-xs text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <ProposalCreateDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* ═══ Proposal Detail Modal ═══ */}
      <Dialog open={!!selectedId} onOpenChange={(open) => { if (!open) { setSelectedId(null); setFundAmount(""); } }}>
        <DialogContent className="max-h-[85vh] overflow-hidden p-0 sm:max-w-lg border-white/10 bg-[#0f1218] ring-1 ring-white/8">
          <DialogTitle className="sr-only">Proposal Detail</DialogTitle>

          <PageHeader
            icon={FileText}
            label="AgentKit"
            title="Proposal Detail"
            description="Complete proposal intelligence and funding controls."
            glow="violet"
          />

          <div className="overflow-y-auto px-4 pb-4" style={{ maxHeight: "calc(85vh - 140px)" }}>
            {detailLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-white/30">Loading…</div>
            ) : selected ? (
              <div className="relative flex flex-col gap-4 pt-2">

                {/* Identity */}
                <ModalSection title="Identity" icon={Hash}>
                  <DetailField label="Title"       value={selected.title} />
                  <DetailField label="Proposal ID" value={selected.proposal_id} mono />
                  <DetailField label="Researcher"  value={selected.researcher_id} mono />
                  <DetailField label="Status"      value={selected.status} badge={statusBadge(selected.status)} />
                </ModalSection>

                {/* Proposal Draft */}
                <ModalSection title="Proposal Draft" icon={FileText}>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/70">
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
                  <p className="text-right text-[11px] text-white/30">{pct(selected)}% funded</p>
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
                        <span key={tag} className="rounded-md bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-300 ring-1 ring-violet-500/20">
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
                        <div key={f.fragment_id} className="rounded-lg bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/6">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-white/80">{f.title}</span>
                            <Badge variant="outline" className={`shrink-0 text-[10px] ${FRAG_STATUS_COLORS[f.status]}`}>
                              {f.status}
                            </Badge>
                          </div>
                          <div className="mt-1 flex items-center gap-3">
                            <span className="font-mono text-[11px] text-white/30">{f.fragment_id}</span>
                            <span className="text-[11px] text-white/40">{f.budget_allocated ?? (f.budget != null ? String(f.budget) : "—")} USDC</span>
                          </div>
                          {f.claimed_by && (
                            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/30">
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
                  <div className="flex gap-2 pt-0.5">
                    <Input
                      placeholder="Amount (USDC)"
                      value={fundAmount}
                      onChange={(e) => setFundAmount(e.target.value)}
                      className="border-white/10 bg-white/[0.025] text-white placeholder:text-white/30"
                    />
                    <Button
                      onClick={handleFund}
                      disabled={fund.isPending || !fundAmount}
                      className="shrink-0 bg-violet-600 hover:bg-violet-700"
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
