"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useProposals } from "@/features/agentkit";
import { Store, FileText, Wallet, MessageSquare } from "lucide-react";
import Link from "next/link";

const QUICK_ACTIONS = [
  { title: "Browse Marketplace", description: "Discover and hire AI agents", icon: Store, href: "/agents/marketplace", color: "text-cyan-400" },
  { title: "Create Proposal", description: "Fund quantum research", icon: FileText, href: "/agents/proposals", color: "text-violet-400" },
  { title: "Check Wallet", description: "View balance and transactions", icon: Wallet, href: "/agents/wallet", color: "text-emerald-400" },
  { title: "Chat with Agent", description: "Natural language interface", icon: MessageSquare, href: "/agents/chat", color: "text-amber-400" },
] as const;

export default function AgentsOverviewPage() {
  const { data: proposals } = useProposals();
  const topProposals = proposals?.filter((p) => p.status === "active").slice(0, 3) ?? [];

  return (
    <div className="space-y-8">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/4 top-0 h-[300px] w-[300px] rounded-full bg-indigo-500/10 blur-[100px]" />
        <div className="absolute right-1/4 top-1/4 h-[200px] w-[200px] rounded-full bg-cyan-500/10 blur-[80px]" />
      </div>

      <div>
        <h1 className="text-2xl font-bold text-white">Agents</h1>
        <p className="text-white/60">Manage your AI agents, proposals, and wallet</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {QUICK_ACTIONS.map((action) => (
          <Link key={action.href} href={action.href}>
            <Card className="border-white/10 bg-white/[0.025] transition-colors hover:bg-white/[0.05]">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <action.icon className={`h-5 w-5 ${action.color}`} />
                <CardTitle className="text-base text-white">{action.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-white/60">{action.description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {topProposals.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Active Proposals</h2>
          {topProposals.map((p) => {
            const pct = Math.round((parseFloat(p.budget_raised) / parseFloat(p.budget_required)) * 100);
            return (
              <Card key={p.proposal_id} className="border-white/10 bg-white/[0.025]">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm text-white">{p.title}</CardTitle>
                    <Badge variant="outline" className="text-violet-400">{p.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Progress value={pct} className="h-2" />
                  <p className="text-xs text-white/60">{p.budget_raised} / {p.budget_required} USDC ({pct}%)</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
