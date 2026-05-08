"use client";

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
  if (node.isLocal) return "#6366f1";
  if (node.isStale) return "#374151";
  if (node.healthStatus === "healthy") return "#22d3ee";
  return "#ef4444";
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
    if (gn.isLocal) return `<span style="font-family:monospace;color:#a5b4fc">▶ local node</span>`;
    return `<span style="font-family:monospace;color:#e2e8f0">${gn.id.slice(0, 20)}&hellip;</span><br/><span style="color:#94a3b8;font-size:11px">${gn.trustTier.replace(/_/g, " ")} &middot; ${gn.healthStatus}</span>`;
  }, []);

  const getNodeColor = useCallback((n: object) => nodeColor(n as GraphNode), []);
  const getNodeVal = useCallback((n: object) => (n as GraphNode).val, []);

  const linkColor = useCallback(() => "rgba(251,146,60,0.65)", []);
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

  const linkParticleColor = useCallback(() => "rgba(253,186,116,0.92)", []);

  // Total activity across all links (for the activity indicator)
  const totalActivity = useMemo(
    () => graphData.links.reduce((sum, l) => sum + l.activity, 0),
    [graphData.links]
  );

  return (
    <div
      className="relative overflow-hidden rounded-2xl ring-1 ring-white/8"
      style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(12px)", height: "460px" }}
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute rounded-full blur-[100px] opacity-20"
          style={{
            width: "50%", height: "70%", left: "25%", top: "15%",
            background: "radial-gradient(circle, rgba(99,102,241,0.5) 0%, rgba(34,211,238,0.3) 50%, transparent 80%)",
          }}
        />
      </div>

      {/* Header label */}
      <div className="pointer-events-none absolute left-4 top-3 z-10 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
          Network Topology
        </span>
        <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
          Live · 3D
        </span>
        {totalActivity > 0 && (
          <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] font-medium text-orange-300">
            {totalActivity} active msg{totalActivity !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Top-right controls */}
      <div className="absolute right-3 top-2.5 z-10 flex items-center gap-2">
        <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] text-white/50 ring-1 ring-white/8">
          {topology?.activePeers ?? 0} active
        </span>
        <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] text-white/50 ring-1 ring-white/8">
          {topology?.totalPeers ?? 0} total
        </span>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/6 ring-1 ring-white/10 transition-all duration-150 hover:bg-white/10 hover:ring-white/20 disabled:opacity-40"
          aria-label="Refresh topology"
          title="Refresh topology"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 text-white/50 ${refreshing ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-3 left-4 z-10 flex items-center gap-3">
        {(
          [
            { color: "#6366f1", label: "Local" },
            { color: "#22d3ee", label: "Healthy" },
            { color: "#374151", label: "Stale" },
            { color: "#ef4444", label: "Unhealthy" },
            { color: "rgba(253,186,116,0.9)", label: "Active comm" },
          ] as Array<{ color: string; label: string }>
        ).map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: item.color, boxShadow: `0 0 4px ${item.color}` }}
            />
            <span className="text-[10px] text-white/30">{item.label}</span>
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
            backgroundColor="rgba(0,0,0,0)"
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
