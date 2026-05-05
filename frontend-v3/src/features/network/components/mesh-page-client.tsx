"use client";
import dynamic from "next/dynamic";
import { Activity, Globe, Wifi, WifiOff, Server, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useNetworkTopology } from "../hooks/use-network-topology";

const Network3dGraph = dynamic(
  () => import("./network-3d-graph").then((m) => ({ default: m.Network3dGraph })),
  { ssr: false },
);

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function MeshPageClient() {
  const { data: topology, isLoading } = useNetworkTopology();

  console.log("topology", topology);

  return (
    <div className="relative flex flex-col gap-6 p-6">

      {/* ── Ambient background glows ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-20 -top-16 h-[400px] w-[400px] rounded-full opacity-25 blur-[100px]"
          style={{ background: "radial-gradient(circle, rgba(34,211,238,0.5) 0%, transparent 70%)" }}
        />
        <div
          className="absolute -right-16 top-1/3 h-[300px] w-[300px] rounded-full opacity-20 blur-[90px]"
          style={{ background: "radial-gradient(circle, rgba(52,211,153,0.5) 0%, transparent 70%)" }}
        />
      </div>

      {/* ── Content ── */}
      <div className="relative z-10 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/6 ring-1 ring-white/8">
            <Globe className="h-5 w-5 animate-pulse text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Topology</h1>
            <p className="text-sm text-white/40">Live network peer topology and connectivity.</p>
          </div>
        </div>

        {/* KPI strip — neutral glass cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Active peers", value: topology?.activePeers, icon: Activity, iconClass: "text-emerald-400", loading: isLoading },
            { label: "Total peers",  value: topology?.totalPeers,  icon: Server,   iconClass: "text-indigo-400",  loading: isLoading },
            { label: "Stale",        value: topology?.stalePeers,  icon: WifiOff,  iconClass: "text-white/30",    loading: isLoading },
          ].map(({ label, value, icon: Icon, iconClass, loading }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-2xl p-4 ring-1 ring-white/8"
              style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/6">
                <Icon className={`h-4 w-4 ${iconClass}`} />
              </div>
              <div>
                {loading ? <Skeleton className="h-7 w-10 bg-white/10" /> : (
                  <p className="text-2xl font-semibold tabular-nums text-white">{value ?? 0}</p>
                )}
                <p className="text-xs text-white/40">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Graph */}
        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-2xl bg-white/5" />
        ) : (
          <Network3dGraph topology={topology ?? null} />
        )}

        {/* Peer list */}
        {!isLoading && topology && topology.peers.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Peers</p>
            <div className="flex flex-col gap-1.5">
              {topology.peers.map((peer) => (
                <div
                  key={peer.peerId}
                  className="flex items-center justify-between rounded-xl px-4 py-3 ring-1 ring-white/8"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                >
                  <div className="flex items-center gap-3">
                    {peer.isStale
                      ? <WifiOff className="h-4 w-4 shrink-0 text-white/20" />
                      : <Wifi className="h-4 w-4 shrink-0 animate-pulse text-emerald-400" />
                    }
                    <span className="font-mono text-xs text-white/60">{peer.peerId.slice(0, 32)}…</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs capitalize text-white/30">{peer.trustTier.replace("_", " ")}</span>
                    <Badge
                      variant="outline"
                      className={
                        peer.healthStatus === "healthy"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : "border-red-500/30 bg-red-500/10 text-red-400"
                      }
                    >
                      {peer.healthStatus === "healthy"
                        ? <CheckCircle2 className="mr-1 h-3 w-3" />
                        : <AlertCircle className="mr-1 h-3 w-3" />
                      }
                      {peer.healthStatus}
                    </Badge>
                    <span className="flex items-center gap-1 text-xs text-white/30">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(peer.lastSeenAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
