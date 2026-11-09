"use client";

import { Button } from "@/components/arc/button/button";

import { resolveColor } from "@/shared/lib/css-color";

import dynamic from "next/dynamic";
import { useRef, useCallback, useMemo, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { QUERY_KEYS } from "@/constants";
import type { NetworkTopology, PeerSummary } from "../types";
import { useNetworkNodes } from "../hooks/use-network-nodes";
import type { ForceGraphMethods } from "react-force-graph-3d";

// ── Types for the force-graph data model ──────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  isLocal: boolean;
  isStale: boolean;
  healthStatus: string;
  trustTier: string;
  val: number;
}

interface GraphLink {
  source: string;
  target: string;
  // activity score: drives particle count + speed
  activity: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// ── Dynamic import: must be ssr:false (Three.js / WebGL) ──────────────────────

const ForceGraph3D = dynamic(
  () => import("react-force-graph-3d").then((m) => m.default),
  { ssr: false }
);

// ── Colour helpers ────────────────────────────────────────────────────────────

function nodeColor(node: GraphNode): string {
  if (node.isLocal) return resolveColor("--accent");
  if (node.isStale) return resolveColor("--text-muted");
  if (node.healthStatus === "healthy") return resolveColor("--success");
  return resolveColor("--danger");
}

// ── Activity score per peer ────────────────────────────────────────────────────

function activityScore(peer: PeerSummary): number {
  // reservoir + execution load → max 10 for display purposes
  const raw = peer.activeReservations + peer.activeExecutions * 2;
  return Math.min(raw + 1, 10); // +1 baseline so even idle healthy peers show 1 particle
}

// ── Build graph data from topology + peer activity metrics ────────────────────

function buildGraph(
  topology: NetworkTopology | null,
  peers: PeerSummary[]
): GraphData {
  if (!topology || topology.peers.length === 0) {
    return {
      nodes: [{ id: "local", label: "local", isLocal: true, isStale: false, healthStatus: "healthy", trustTier: "trusted", val: 3 }],
      links: [],
    };
  }

  // Index peer activity by peerId for O(1) lookup
  const activityById = new Map<string, number>(
    peers.map((p) => [p.peerId, activityScore(p)])
  );

  const localId = "local";
  const localNode: GraphNode = {
    id: localId,
    label: "local",
    isLocal: true,
    isStale: false,
    healthStatus: "healthy",
    trustTier: "trusted",
    val: 3,
  };

  const peerNodes: GraphNode[] = topology.peers.map((p) => ({
    id: p.peerId,
    label: p.peerId.slice(0, 8),
    isLocal: false,
    isStale: p.isStale,
    healthStatus: p.healthStatus,
    trustTier: p.trustTier,
    val: p.isStale ? 0.8 : 1.5,
  }));

  // Star links: every peer → local hub
  const links: GraphLink[] = peerNodes.map((n) => ({
    source: localId,
    target: n.id,
    activity: n.isStale ? 0 : (activityById.get(n.id) ?? 1),
  }));

  // Mesh links between healthy peers of same trust tier
  const healthy = peerNodes.filter((n) => !n.isStale);
  for (let i = 0; i < healthy.length - 1; i++) {
    for (let j = i + 1; j < healthy.length; j++) {
      if (healthy[i].trustTier === healthy[j].trustTier) {
        const combined = Math.round(
          ((activityById.get(healthy[i].id) ?? 1) +
            (activityById.get(healthy[j].id) ?? 1)) /
            2
        );
        links.push({ source: healthy[i].id, target: healthy[j].id, activity: combined });
      }
    }
  }

  return { nodes: [localNode, ...peerNodes], links };
}

// ── Main component ────────────────────────────────────────────────────────────

interface Network3dGraphProps {
  topology: NetworkTopology | null;
}

export function Network3dGraph({ topology }: Network3dGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  const queryClient = useQueryClient();

  // Pull live peer activity metrics (same refetch cadence as topology)
  const { data: peersRaw } = useNetworkNodes();
  const peers = useMemo(() => peersRaw ?? [], [peersRaw]);

  const [dims, setDims] = useState<{ w: number; h: number; mounted: boolean }>(
    () => ({ w: 800, h: 460, mounted: false })
  );
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      setDims((prev) =>
        r
          ? { w: Math.floor(r.width), h: Math.floor(r.height), mounted: true }
          : { ...prev, mounted: true }
      );
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const graphData = useMemo(() => buildGraph(topology, peers), [topology, peers]);

  // Zoom to fit once the simulation settles
  const handleEngineStop = useCallback(() => {
    graphRef.current?.zoomToFit(400, 60);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.network.topology() }),
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.network.nodes() }),
    ]);
    setTimeout(() => {
      graphRef.current?.zoomToFit(400, 60);
      setRefreshing(false);
    }, 600);
  }, [queryClient]);

  const nodeLabel = useCallback((node: object) => {
    const gn = node as GraphNode;
    if (gn.isLocal) return `<span style="font-family:monospace;color:var(--accent)">▶ local node</span>`;
    return `<span style="font-family:monospace;color:var(--foreground)">${gn.id.slice(0, 20)}&hellip;</span><br/><span style="color:var(--text-secondary);font-size:11px">${gn.trustTier.replace(/_/g, " ")} &middot; ${gn.healthStatus}</span>`;
  }, []);

  const getNodeColor = useCallback((n: object) => nodeColor(n as GraphNode), []);
  const getNodeVal = useCallback((n: object) => (n as GraphNode).val, []);

  const linkColor = useCallback(() => resolveColor("--warning", 0.65), []);
  const linkWidth = useCallback(() => 1.2, []);

  // Particle count = activity score (0 for stale peers → no dots shown)
  const getLinkParticles = useCallback(
    (link: object) => (link as GraphLink).activity,
    []
  );

  // Speed proportional to activity: busier links pulse faster
  const getLinkParticleSpeed = useCallback(
    (link: object) => {
      const a = (link as GraphLink).activity;
      // Map activity 0-10 → speed 0.002-0.012
      return a === 0 ? 0 : 0.003 + a * 0.0009;
    },
    []
  );

  const getLinkParticleWidth = useCallback(
    (link: object) => {
      const a = (link as GraphLink).activity;
      // Busier links get bigger dots
      return a >= 5 ? 2.0 : 1.4;
    },
    []
  );

  const linkParticleColor = useCallback(() => resolveColor("--warning", 0.92), []);

  // Total activity across all links (for the activity indicator)
  const totalActivity = useMemo(
    () => graphData.links.reduce((sum, l) => sum + l.activity, 0),
    [graphData.links]
  );

  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-surface ring-1 ring-border"
      style={{ height: "460px" }}
    >

      {/* Header label */}
      <div className="pointer-events-none absolute left-4 top-3 z-10 flex items-center gap-2">
        <span className="text-xs font-medium text-faint">
          Network Topology
        </span>
        <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
          Live · 3D
        </span>
        {totalActivity > 0 && (
          <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning">
            {totalActivity} active msg{totalActivity !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Top-right controls */}
      <div className="absolute right-3 top-2.5 z-10 flex items-center gap-2">
        <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs text-subtle ring-1 ring-border">
          {topology?.activePeers ?? 0} active
        </span>
        <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs text-subtle ring-1 ring-border">
          {topology?.totalPeers ?? 0} total
        </span>
        <Button variant="secondary" size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="w-7 justify-center"
          aria-label="Refresh topology"
          title="Refresh topology">
          <RefreshCw
            className={`h-3.5 w-3.5 text-subtle ${refreshing ?"animate-spin" : ""}`}
          />
        </Button>
      </div>

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-3 left-4 z-10 flex items-center gap-3">
        {(
          [
            { color: "var(--accent)", label: "Local" },
            { color: "var(--success)", label: "Healthy" },
            { color: "var(--text-muted)", label: "Stale" },
            { color: "var(--danger)", label: "Unhealthy" },
            { color: "var(--warning)", label: "Active comm" },
          ] as Array<{ color: string; label: string }>
        ).map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: item.color }}
            />
            <span className="text-xs text-faint">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Graph canvas */}
      <div ref={containerRef} className="absolute inset-0">
        {dims.mounted && (
          <ForceGraph3D
            ref={graphRef}
            width={dims.w}
            height={dims.h}
            graphData={graphData}
            backgroundColor="transparent"
            nodeColor={getNodeColor}
            nodeVal={getNodeVal}
            nodeLabel={nodeLabel}
            linkColor={linkColor}
            linkWidth={linkWidth}
            linkDirectionalParticles={getLinkParticles}
            linkDirectionalParticleSpeed={getLinkParticleSpeed}
            linkDirectionalParticleWidth={getLinkParticleWidth}
            linkDirectionalParticleColor={linkParticleColor}
            onEngineStop={handleEngineStop}
            enableNodeDrag
            enableNavigationControls
            showNavInfo={false}
            cooldownTicks={120}
            d3VelocityDecay={0.25}
          />
        )}
      </div>
    </div>
  );
}
