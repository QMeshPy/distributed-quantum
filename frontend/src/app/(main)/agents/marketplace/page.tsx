"use client";

import { useState } from "react";
import { useMarketplace, useCreateAgent } from "@/features/agentkit";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Search, Star, Store } from "lucide-react";
import type { MarketplaceAgent } from "@/features/agentkit";

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const partial = rating - full;
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className="h-3 w-3"
          fill={
            i < full
              ? "currentColor"
              : i === full && partial >= 0.5
              ? "currentColor"
              : "none"
          }
          strokeWidth={1.5}
          style={{
            color: i < full || (i === full && partial >= 0.5) ? "#f59e0b" : "rgba(255,255,255,0.2)",
          }}
        />
      ))}
      <span className="ml-1 text-[10px] text-amber-400/80">{rating.toFixed(1)}</span>
    </span>
  );
}

function formatPrice(agent: MarketplaceAgent): string {
  const raw = agent.price_per_task ?? parseFloat(agent.pricing_per_task);
  if (!raw || raw === 0) return "Free";
  return `$${raw}/task`;
}

export default function MarketplacePage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MarketplaceAgent | null>(null);
  const [hiring, setHiring] = useState(false);
  const { data: agents, isLoading } = useMarketplace(search || undefined);
  const createAgent = useCreateAgent();

  const hireAgent = async (agent: MarketplaceAgent) => {
    setHiring(true);
    try {
      await createAgent.mutateAsync({
        agent_name: agent.agent_name,
        config: {
          auto_fund: false,
          max_per_proposal: "50",
          daily_budget: "200",
          research_interests: agent.capabilities,
          min_reputation_threshold: 40,
        },
      });
      setSelected(null);
      router.push("/agents/chat");
    } catch {
      // agent may already exist — just navigate
      setSelected(null);
      router.push("/agents/chat");
    } finally {
      setHiring(false);
    }
  };

  return (
    <div className="relative flex flex-col">

      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-x-6 top-0 overflow-hidden" style={{ height: "300px" }}>
        <div className="absolute h-[280px] w-[280px] rounded-full opacity-20 blur-[80px]" style={{ left: "0%", top: "-50px", background: "radial-gradient(circle, rgba(34,211,238,0.65) 0%, transparent 70%)" }} />
        <div className="absolute h-[220px] w-[220px] rounded-full opacity-15 blur-[70px]" style={{ right: "5%", top: "-30px", background: "radial-gradient(circle, rgba(99,102,241,0.6) 0%, transparent 70%)" }} />
      </div>

      <PageHeader
        icon={Store}
        label="AgentKit"
        title="Marketplace"
        description="Discover and hire AI agents for quantum research."
        glow="cyan"
      />

      <div className="relative z-10 flex flex-col gap-6 p-6">

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <Input
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-white/10 bg-white/[0.025] pl-9 text-white placeholder:text-white/30"
          />
        </div>

        {/* Agent grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl p-4 ring-1 ring-white/8 space-y-3" style={{ background: "rgba(255,255,255,0.04)" }}>
                <Skeleton className="h-5 w-32 bg-white/10" />
                <Skeleton className="h-4 w-full bg-white/10" />
                <Skeleton className="h-4 w-24 bg-white/10" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents?.map((agent) => (
              <div
                key={agent.agent_id}
                className="group relative overflow-hidden rounded-2xl p-4 ring-1 ring-white/10 transition-all duration-200 hover:ring-white/20 hover:scale-[1.01]"
                style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
              >
                {/* Hover gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/15 via-cyan-600/6 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                <div className="relative z-10 space-y-3">
                  {/* Name + status */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white/90 truncate">{agent.agent_name}</p>
                    <Badge
                      variant="outline"
                      className={
                        agent.status === "active" || agent.status === "available"
                          ? "shrink-0 text-emerald-400 border-emerald-400/30 text-[10px]"
                          : "shrink-0 text-white/30 text-[10px]"
                      }
                    >
                      {agent.status}
                    </Badge>
                  </div>

                  {/* Specialty badge */}
                  {agent.specialty && (
                    <Badge variant="secondary" className="text-[10px] bg-indigo-500/15 text-indigo-300 border-0">
                      {agent.specialty}
                    </Badge>
                  )}

                  {/* Description */}
                  <p className="line-clamp-2 text-xs text-white/40 leading-relaxed">{agent.description}</p>

                  {/* Capabilities */}
                  {agent.capabilities.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {agent.capabilities.slice(0, 3).map((cap) => (
                        <Badge key={cap} variant="secondary" className="text-[10px] bg-cyan-500/10 text-cyan-400 border-0">
                          {cap}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Footer: price + rating + view */}
                  <div className="flex items-center justify-between pt-1 gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-medium text-white/50 shrink-0">{formatPrice(agent)}</span>
                      {agent.rating != null && <StarRating rating={agent.rating} />}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelected(agent)}
                      className="h-7 px-3 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 shrink-0"
                    >
                      View
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
        <SheetContent className="w-[420px] border-white/10 bg-background">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="text-white">{selected.agent_name}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                {selected.specialty && (
                  <Badge variant="secondary" className="bg-indigo-500/15 text-indigo-300 border-0">
                    {selected.specialty}
                  </Badge>
                )}
                <p className="text-sm text-white/70">{selected.description}</p>
                {selected.capabilities.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-white">Capabilities</h3>
                    <div className="flex flex-wrap gap-1">
                      {selected.capabilities.map((cap) => (
                        <Badge key={cap} variant="secondary" className="bg-cyan-500/10 text-cyan-400 border-0">
                          {cap}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 rounded-xl border border-white/10 p-3" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <div>
                    <p className="text-xs text-white/40">Price</p>
                    <p className="text-sm text-white">{formatPrice(selected)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40">Tasks</p>
                    <p className="text-sm text-white">{selected.total_tasks}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40">Rating</p>
                    <div className="mt-0.5">
                      {selected.rating != null ? (
                        <StarRating rating={selected.rating} />
                      ) : (
                        <p className="text-sm text-white">{selected.reputation_score}/100</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-white/40">Status</p>
                    <p className="text-sm text-white">{selected.status}</p>
                  </div>
                </div>
                <Button
                  className="w-full bg-cyan-600 hover:bg-cyan-700"
                  onClick={() => selected && hireAgent(selected)}
                  disabled={hiring}
                >
                  {hiring ? "Hiring…" : "Hire Agent"}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
