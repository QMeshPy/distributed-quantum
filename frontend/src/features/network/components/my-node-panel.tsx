"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity, Cpu, Clock, Wifi, WifiOff, Copy, Check, ArrowUpRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const [copied, setCopied] = useState(false);
  const { data: networkNodes } = useNetworkNodes();

  const livePeer = networkNodes?.find((p) => p.peerId === node.peerId);
  const isOnline = Boolean(livePeer);

  const displayLabel = node.label ?? `${node.peerId.slice(0, 12)}…`;

  function handleCopy() {
    void navigator.clipboard.writeText(node.peerId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div
      className="group relative overflow-hidden rounded-2xl ring-1 ring-white/8 transition-all duration-200 hover:ring-white/15"
      style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
    >
      {/* Gradient glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background: isOnline
            ? "radial-gradient(ellipse 60% 50% at 10% 20%, rgba(52,211,153,0.12) 0%, transparent 70%)"
            : "radial-gradient(ellipse 60% 50% at 10% 20%, rgba(255,255,255,0.03) 0%, transparent 70%)",
        }}
      />

      <div className="relative p-5">
        {/* Top row: icon + label + status */}
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isOnline ? "bg-emerald-500/10" : "bg-white/6"}`}>
            {isOnline
              ? <Wifi className="h-4 w-4 text-emerald-400" />
              : <WifiOff className="h-4 w-4 text-white/30" />
            }
          </div>
          <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
            <h3 className="text-base font-medium text-white/90 truncate">{displayLabel}</h3>
            <Badge
              variant="outline"
              className={`shrink-0 text-[11px] ${
                isOnline
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-white/10 bg-white/5 text-white/40"
              }`}
            >
              <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-400 animate-pulse" : "bg-white/30"}`} />
              {isOnline ? "Online" : "Offline"}
            </Badge>
          </div>
        </div>

        {/* Peer ID row */}
        <button
          onClick={handleCopy}
          className="mt-3 flex w-full items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 ring-1 ring-white/6 transition-colors hover:bg-white/[0.06] hover:ring-white/10 cursor-pointer text-left"
        >
          <span className="flex-1 truncate font-mono text-[11px] text-white/50">
            {node.peerId}
          </span>
          {copied
            ? <Check className="h-3 w-3 shrink-0 text-emerald-400" />
            : <Copy className="h-3 w-3 shrink-0 text-white/30" />
          }
        </button>

        {/* Metrics row */}
        {isOnline && livePeer ? (
          <div className="mt-4 grid grid-cols-4 gap-3">
            {[
              { label: "Services", value: livePeer.serviceCount, icon: Cpu, iconClass: "text-cyan-400" },
              { label: "Reservations", value: livePeer.activeReservations, icon: Activity, iconClass: "text-violet-400" },
              { label: "Executions", value: livePeer.activeExecutions, icon: Activity, iconClass: "text-amber-400" },
              { label: "Last Seen", value: formatRelativeTime(livePeer.lastSeenAt), icon: Clock, iconClass: "text-white/40" },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="flex flex-col items-center gap-1.5 rounded-xl bg-white/[0.03] px-2 py-3 ring-1 ring-white/6">
                  <Icon className={`h-3.5 w-3.5 ${stat.iconClass}`} />
                  <span className="text-sm font-semibold tabular-nums text-white">{stat.value}</span>
                  <span className="text-[10px] text-white/30">{stat.label}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-xs text-white/25">Node is not currently visible to the coordinator.</p>
        )}

        {/* Footer actions */}
        <div className="mt-4 flex items-center justify-between border-t border-white/6 pt-3">
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs text-white/40 hover:text-white/70"
          >
            <Link href="/network/nodes/join">
              Setup guide
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </Button>
          <span className="text-[10px] text-white/20">
            Registered {formatRelativeTime(node.registeredAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
