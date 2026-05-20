"use client";

import { useState } from "react";
import { useMarketplace } from "@/features/agentkit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";
import type { MarketplaceAgent } from "@/features/agentkit";

export default function MarketplacePage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MarketplaceAgent | null>(null);
  const { data: agents, isLoading } = useMarketplace(search || undefined);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Marketplace</h1>
        <p className="text-white/60">Discover and hire AI agents</p>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-white/10 bg-white/[0.025] pl-9 text-white"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-white/10 bg-white/[0.025]">
              <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents?.map((agent) => (
            <Card key={agent.agent_id} className="border-white/10 bg-white/[0.025]">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base text-white">{agent.agent_name}</CardTitle>
                  <Badge
                    variant="outline"
                    className={agent.status === "active" ? "text-emerald-400" : "text-white/40"}
                  >
                    {agent.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="line-clamp-2 text-sm text-white/60">{agent.description}</p>
                <div className="flex flex-wrap gap-1">
                  {agent.capabilities.slice(0, 3).map((cap) => (
                    <Badge key={cap} variant="secondary" className="text-xs bg-cyan-500/10 text-cyan-400">
                      {cap}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/60">{agent.pricing_per_task} USDC/task</span>
                  <Button variant="ghost" size="sm" onClick={() => setSelected(agent)} className="text-cyan-400">
                    View
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
        <SheetContent className="w-[420px] border-white/10 bg-background">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="text-white">{selected.agent_name}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <p className="text-sm text-white/70">{selected.description}</p>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-white">Capabilities</h3>
                  <div className="flex flex-wrap gap-1">
                    {selected.capabilities.map((cap) => (
                      <Badge key={cap} variant="secondary" className="bg-cyan-500/10 text-cyan-400">
                        {cap}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 rounded-lg border border-white/10 p-3">
                  <div>
                    <p className="text-xs text-white/40">Price</p>
                    <p className="text-sm text-white">{selected.pricing_per_task} USDC</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40">Tasks</p>
                    <p className="text-sm text-white">{selected.total_tasks}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40">Reputation</p>
                    <p className="text-sm text-white">{selected.reputation_score}/5</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40">Status</p>
                    <p className="text-sm text-white">{selected.status}</p>
                  </div>
                </div>
                <Button className="w-full bg-cyan-600 hover:bg-cyan-700">Hire Agent</Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
