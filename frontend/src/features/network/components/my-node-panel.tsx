"use client";

import {
  Activity, Cpu, Clock, Wifi, WifiOff, ArrowUpRight,
} from "lucide-react";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import { Badge } from "@/components/arc/badge/badge";
import { LinkButton } from "@/shared/components/link-button";
import { useNetworkNodes } from "../hooks/use-network-nodes";
import type { MyNode } from "../types";

interface MyNodePanelProps {
  node: MyNode;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function MyNodePanel({ node }: MyNodePanelProps) {
  const { data: networkNodes } = useNetworkNodes();

  const livePeer = networkNodes?.find((p) => p.peerId === node.peerId);
  const isOnline = Boolean(livePeer);

  const displayLabel = node.label ?? `${node.peerId.slice(0, 12)}…`;


  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-surface ring-1 ring-border"
    >

      <div className="relative p-5">
        {/* Top row: icon + label + status */}
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isOnline ?"bg-success/10" : "bg-surface-muted"}`}>
            {isOnline
              ? <Wifi className="h-4 w-4 text-success" />
              : <WifiOff className="h-4 w-4 text-faint" />
            }
          </div>
          <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
            <h3 className="text-base font-medium text-foreground truncate">{displayLabel}</h3>
            <Badge
              outline
              className={`shrink-0 text-xs ${
                isOnline
                  ?"border-success/30 bg-success/10 text-success"
                  : "border-border bg-surface-muted text-subtle"
              }`}
            >
              <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${isOnline ?"bg-success animate-pulse" : "bg-foreground/30"}`} />
              {isOnline ? "Online" : "Offline"}
            </Badge>
          </div>
        </div>

        {/* Peer ID row */}
        <CopyButton value={node.peerId} label={node.peerId} className="mt-3 w-full" />

        {/* Metrics row */}
        {isOnline && livePeer ? (
          <div className="mt-4 grid grid-cols-4 gap-3">
            {[
              { label: "Services", value: livePeer.serviceCount, icon: Cpu, iconClass: "text-info" },
              { label: "Reservations", value: livePeer.activeReservations, icon: Activity, iconClass: "text-accent" },
              { label: "Executions", value: livePeer.activeExecutions, icon: Activity, iconClass: "text-warning" },
              { label: "Last Seen", value: formatRelativeTime(livePeer.lastSeenAt), icon: Clock, iconClass: "text-subtle" },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="flex flex-col items-center gap-1.5 rounded-xl bg-surface-muted px-2 py-3 ring-1 ring-border">
                  <Icon className={`h-3.5 w-3.5 ${stat.iconClass}`} />
                  <span className="text-sm font-medium tabular-nums text-foreground">{stat.value}</span>
                  <span className="text-xs text-faint">{stat.label}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-xs text-faint">Node is not currently visible to the coordinator.</p>
        )}

        {/* Footer actions */}
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <LinkButton href="/network/nodes/join" size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs text-subtle hover:text-foreground">
              Setup guide
              <ArrowUpRight className="h-3 w-3" />
            </LinkButton>
          <span className="text-xs text-faint">
            Registered {formatRelativeTime(node.registeredAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
