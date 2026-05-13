"use client";

import { useState } from "react";
import Link from "next/link";
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
      className="rounded-2xl p-4 ring-1 ring-white/8 flex flex-col gap-3"
      style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
    >
      {/* Label + status badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-white/90 truncate">{displayLabel}</span>
        {isOnline ? (
          <Badge className="shrink-0 bg-emerald-500/15 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20 text-xs">
            Online
          </Badge>
        ) : (
          <Badge className="shrink-0 bg-white/8 text-white/40 border-white/10 text-xs">
            Offline
          </Badge>
        )}
      </div>

      {/* Peer ID */}
      <span
        className="font-mono text-xs text-white/40 truncate cursor-default"
        title={node.peerId}
      >
        {node.peerId}
      </span>

      {/* Online: last seen; Offline: hint */}
      {isOnline && livePeer ? (
        <p className="text-xs text-white/30">
          Last seen {formatRelativeTime(livePeer.lastSeenAt)}
        </p>
      ) : (
        <p className="text-xs text-white/25">Not seen by coordinator yet.</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button asChild size="sm" variant="outline" className="h-7 text-xs border-white/10 text-white/60 hover:text-white/90">
          <Link href="/network/nodes/join">Setup guide</Link>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-white/50 hover:text-white/80"
          onClick={handleCopy}
        >
          {copied ? "Copied!" : "Copy Peer ID"}
        </Button>
      </div>
    </div>
  );
}
