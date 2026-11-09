"use client";

import { useState } from "react";
import { useMarketplace, useCreateAgent } from "@/features/agentkit";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { Drawer, DrawerContent } from "@/components/arc/drawer/drawer";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
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
            color: i < full || (i === full && partial >= 0.5) ? "var(--warning)" : "color-mix(in oklab, var(--foreground) 20%, transparent)",
          }}
        />
      ))}
      <span className="ml-1 text-xs text-warning">{rating.toFixed(1)}</span>
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
      const created = await createAgent.mutateAsync({
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
      const agentId: string = (created as { agent_id?: string })?.agent_id ?? "";
      const params = new URLSearchParams({ name: agent.agent_name });
      if (agentId) params.set("agentId", agentId);
      if (agent.specialty) params.set("specialty", agent.specialty);
      params.set("capabilities", agent.capabilities.slice(0, 6).join(","));
      router.push(`/agents/chat?${params.toString()}`);
    } catch {
      // agent may already exist, navigate with marketplace context so chat has persona
      setSelected(null);
      const params = new URLSearchParams({ name: agent.agent_name });
      if (agent.specialty) params.set("specialty", agent.specialty);
      params.set("capabilities", agent.capabilities.slice(0, 6).join(","));
      router.push(`/agents/chat?${params.toString()}`);
    } finally {
      setHiring(false);
    }
  };

  return (
    <div className="relative flex flex-col">

      <div className="pointer-events-none absolute inset-x-6 top-0 overflow-hidden" style={{ height: "300px" }}>
        
        
      </div>

      <PageHeader
        icon={Store}
        title="Marketplace"
        description="Discover and hire AI agents for quantum research."
      />

      <div className="relative z-10 flex flex-col gap-6 p-6">

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            label="Search agents" placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-border bg-surface-muted pl-9 text-foreground placeholder:text-faint"
          />
        </div>

        {/* Agent grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl p-4 ring-1 ring-border space-y-3" style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}>
                <Skeleton lines={1} className="h-5 w-32" />
                <Skeleton lines={1} className="h-4 w-full" />
                <Skeleton lines={1} className="h-4 w-24" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents?.map((agent) => (
              <div
                key={agent.agent_id}
                className="group relative overflow-hidden rounded-2xl p-4 ring-1 ring-border transition-all duration-200 hover:ring-border-strong hover:scale-[1.01]"
                style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
              >
                <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                <div className="relative z-10 space-y-3">
                  {/* Name + status */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{agent.agent_name}</p>
                    <Badge
                      outline
                      className={
                        agent.status === "active" || agent.status === "available"
                          ? "shrink-0 text-success border-success/30 text-xs"
                          : "shrink-0 text-faint text-xs"
                      }
                    >
                      {agent.status}
                    </Badge>
                  </div>

                  {/* Specialty badge */}
                  {agent.specialty && (
                    <Badge  className="text-xs bg-accent/15 text-accent border-0">
                      {agent.specialty}
                    </Badge>
                  )}

                  {/* Description */}
                  <p className="line-clamp-2 text-xs text-subtle leading-relaxed">{agent.description}</p>

                  {/* Capabilities */}
                  {agent.capabilities.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {agent.capabilities.slice(0, 3).map((cap) => (
                        <Badge key={cap}  className="text-xs bg-info/10 text-info border-0">
                          {cap}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Footer: price + rating + view */}
                  <div className="flex items-center justify-between pt-1 gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-medium text-subtle shrink-0">{formatPrice(agent)}</span>
                      {agent.rating != null && <StarRating rating={agent.rating} />}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelected(agent)}
                      className="h-7 px-3 text-xs text-info hover:text-info hover:bg-info/10 shrink-0"
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

      <Drawer open={!!selected} onOpenChange={() => setSelected(null)}>
        <DrawerContent title={selected?.agent_name ?? ""}>
          {selected && (
            <>
              
              <div className="mt-6 space-y-4">
                {selected.specialty && (
                  <Badge  className="bg-accent/15 text-accent border-0">
                    {selected.specialty}
                  </Badge>
                )}
                <p className="text-sm text-foreground">{selected.description}</p>
                {selected.capabilities.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-foreground">Capabilities</h3>
                    <div className="flex flex-wrap gap-1">
                      {selected.capabilities.map((cap) => (
                        <Badge key={cap}  className="bg-info/10 text-info border-0">
                          {cap}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 rounded-xl border border-border p-3" style={{ background: "color-mix(in oklab, var(--foreground) 3%, transparent)" }}>
                  <div>
                    <p className="text-xs text-subtle">Price</p>
                    <p className="text-sm text-foreground">{formatPrice(selected)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-subtle">Tasks</p>
                    <p className="text-sm text-foreground">{selected.total_tasks}</p>
                  </div>
                  <div>
                    <p className="text-xs text-subtle">Rating</p>
                    <div className="mt-0.5">
                      {selected.rating != null ? (
                        <StarRating rating={selected.rating} />
                      ) : (
                        <p className="text-sm text-foreground">{selected.reputation_score}/100</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-subtle">Status</p>
                    <p className="text-sm text-foreground">{selected.status}</p>
                  </div>
                </div>
                <Button
                  className="w-full bg-info hover:bg-info"
                  onClick={() => selected && hireAgent(selected)}
                  disabled={hiring}
                >
                  {hiring ? "Hiring…" : "Hire Agent"}
                </Button>
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
