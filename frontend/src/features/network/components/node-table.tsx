"use client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useNetworkNodes } from "../hooks/use-network-nodes";
import { getHealthBadgeVariant } from "../lib/network-transformers";

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NodeTable() {
  const { data: nodes, isLoading } = useNetworkNodes();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl bg-white/5" />
        ))}
      </div>
    );
  }

  if (!nodes?.length) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-2xl py-16 ring-1 ring-white/8"
        style={{ background: "rgba(255,255,255,0.04)" }}
      >
        <p className="text-sm text-white/30">No nodes discovered yet.</p>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-2xl ring-1 ring-white/8"
      style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
    >
      {/* Header row */}
      <div className="grid grid-cols-6 gap-4 border-b border-white/6 px-4 py-2.5">
        {["Peer ID", "Health", "Trust Tier", "Services", "Active Exec.", "Last Seen"].map((h) => (
          <p key={h} className="text-[10px] font-semibold uppercase tracking-widest text-white/25">{h}</p>
        ))}
      </div>
      {nodes.map((node, i) => (
        <div
          key={node.peerId}
          className={`grid grid-cols-6 gap-4 items-center px-4 py-3 hover:bg-white/3 transition-colors ${node.isStale ? "opacity-40" : ""} ${i > 0 ? "border-t border-white/5" : ""}`}
        >
          <span className="font-mono text-xs text-white/60">{node.peerId.slice(0, 20)}…</span>
          <div>
            <Badge
              variant={getHealthBadgeVariant(node.healthStatus)}
              className={`capitalize text-xs ${node.healthStatus === "healthy" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20" : "bg-red-500/15 text-red-400 border-red-500/20"}`}
            >
              {node.healthStatus}
            </Badge>
          </div>
          <span className="text-sm capitalize text-white/50">{node.trustTier}</span>
          <span className="tabular-nums text-sm text-white/60">{node.serviceCount}</span>
          <span className="tabular-nums text-sm text-white/60">{node.activeExecutions}</span>
          <span className="text-xs text-white/30">{formatRelativeTime(node.lastSeenAt)}</span>
        </div>
      ))}
    </div>
  );
}
