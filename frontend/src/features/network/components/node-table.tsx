"use client";
import { Badge } from "@/components/arc/badge/badge";
import { legacyBadge } from "@/lib/legacy-badge";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
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
          <Skeleton lines={2} key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!nodes?.length) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-2xl py-16 ring-1 ring-border"
        style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
      >
        <p className="text-sm text-faint">No nodes discovered yet.</p>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-2xl ring-1 ring-border"
      style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
    >
      {/* Header row */}
      <div className="grid grid-cols-6 gap-4 border-b border-border px-4 py-2.5">
        {["Peer ID", "Health", "Trust Tier", "Services", "Active Exec.", "Last Seen"].map((h) => (
          <p key={h} className="text-xs font-medium text-faint">{h}</p>
        ))}
      </div>
      {nodes.map((node, i) => (
        <div
          key={node.peerId}
          className={`grid grid-cols-6 gap-4 items-center px-4 py-3 hover:bg-surface-muted transition-colors ${node.isStale ?"opacity-40" : ""} ${i > 0 ? "border-t border-border" : ""}`}
        >
          <span className="font-mono text-xs text-subtle">{node.peerId.slice(0, 20)}…</span>
          <div>
            <Badge
              {...legacyBadge(getHealthBadgeVariant(node.healthStatus))}
              className={`capitalize text-xs ${node.healthStatus ==="healthy" ? "bg-success/15 text-success border-success/20 hover:bg-success/20" : "bg-danger/15 text-danger border-danger/20"}`}
            >
              {node.healthStatus}
            </Badge>
          </div>
          <span className="text-sm capitalize text-subtle">{node.trustTier}</span>
          <span className="tabular-nums text-sm text-subtle">{node.serviceCount}</span>
          <span className="tabular-nums text-sm text-subtle">{node.activeExecutions}</span>
          <span className="text-xs text-faint">{formatRelativeTime(node.lastSeenAt)}</span>
        </div>
      ))}
    </div>
  );
}
