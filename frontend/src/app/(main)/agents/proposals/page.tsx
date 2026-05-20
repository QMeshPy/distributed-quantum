"use client";

import { useState } from "react";
import { useProposals, useFundProposal, ProposalCreateDialog } from "@/features/agentkit";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus } from "lucide-react";
import type { Proposal } from "@/features/agentkit";

export default function ProposalsPage() {
  const { data: proposals = [], isLoading } = useProposals();
  const [selected, setSelected] = useState<Proposal | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const fund = useFundProposal();

  const handleFund = () => {
    if (!selected || !fundAmount) return;
    fund.mutate({ id: selected.proposal_id, amount: fundAmount });
    setFundAmount("");
  };

  const pct = (p: Proposal) =>
    Math.round((parseFloat(p.budget_raised) / parseFloat(p.budget_required)) * 100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Proposals</h1>
          <p className="text-white/60">Fund and manage research proposals</p>
        </div>
        <Button className="bg-violet-600 hover:bg-violet-700" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Proposal
        </Button>
      </div>

      <Card className="border-white/10 bg-white/[0.025]">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="text-white/60">Title</TableHead>
              <TableHead className="text-white/60">Status</TableHead>
              <TableHead className="text-white/60">Funding</TableHead>
              <TableHead className="text-white/60">Deadline</TableHead>
              <TableHead className="text-white/60" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-white/40">
                  Loading…
                </TableCell>
              </TableRow>
            ) : proposals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-white/40">
                  No proposals yet — create the first one
                </TableCell>
              </TableRow>
            ) : (
              proposals.map((p) => (
                <TableRow key={p.proposal_id} className="border-white/10">
                  <TableCell className="text-white">{p.title}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-violet-400">
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={pct(p)} className="h-2 w-20" />
                      <span className="text-xs text-white/60">{pct(p)}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-white/60">{p.deadline}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelected(p)}
                      className="text-violet-400"
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <ProposalCreateDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
        <SheetContent className="w-[420px] border-white/10 bg-background">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="text-white">{selected.title}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <p className="text-sm text-white/70">{selected.description}</p>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Raised</span>
                    <span className="text-white">
                      {selected.budget_raised} / {selected.budget_required} USDC
                    </span>
                  </div>
                  <Progress value={pct(selected)} className="h-3" />
                </div>

                <div className="flex flex-wrap gap-1">
                  {selected.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="bg-violet-500/10 text-violet-400"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Amount (USDC)"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    className="border-white/10 bg-white/[0.025] text-white"
                  />
                  <Button
                    onClick={handleFund}
                    disabled={fund.isPending}
                    className="bg-violet-600 hover:bg-violet-700"
                  >
                    Fund
                  </Button>
                </div>

                {selected.fragments.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-white">Fragments</h3>
                    {selected.fragments.map((f) => (
                      <div
                        key={f.fragment_id}
                        className="flex items-center justify-between rounded border border-white/10 p-2"
                      >
                        <div>
                          <p className="text-sm text-white">{f.title}</p>
                          <p className="text-xs text-white/40">{f.budget} USDC</p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {f.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
