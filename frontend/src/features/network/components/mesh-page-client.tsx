"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Globe, Wifi, WifiOff, Server, CheckCircle2, AlertCircle, Clock, Cpu, Layers, Zap, Network, Shield, Radio, Hash, CalendarClock, MapPin, Link2 } from "lucide-react";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { Badge } from "@/components/arc/badge/badge";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { QUERY_KEYS } from "@/constants";
import { PageHeader } from "@/shared/components/layout/page-header";
import { useNetworkTopology } from "../hooks/use-network-topology";
import { useNetworkStats } from "../hooks/use-network-stats";
import { useNetworkServices } from "../hooks/use-network-fidelity";
import { Network3dGraph } from "./network-3d-graph";
import { transformPeerDetail } from "../lib/network-transformers";
import type { BackendPeerDetail, PeerDetail, ServiceNode } from "../types";

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function usePeerDetail(peerId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.network.peer(peerId ?? ""),
    queryFn: async (): Promise<PeerDetail> => {
      const res = await fetch(`/api/network/peers/${peerId}`);
      if (!res.ok) throw new Error("Failed to fetch peer detail");
      const data = (await res.json()) as BackendPeerDetail;
      return transformPeerDetail(data);
    },
    enabled: peerId !== null,
    staleTime: 10_000,
  });
}

export function MeshPageClient() {
  const { data: topology, isLoading: topoLoading } = useNetworkTopology();
  const { data: stats, isLoading: statsLoading } = useNetworkStats();
  const { data: servicesRaw, isLoading: svcLoading } = useNetworkServices();
  const services = (servicesRaw as ServiceNode[] | undefined) ?? [];

  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceNode | null>(null);

  const { data: peerDetail, isLoading: peerDetailLoading } = usePeerDetail(selectedPeerId);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader icon={Globe} title="Topology" description="Live network peer topology and connectivity." />

      <div className="relative flex-1 overflow-y-auto p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden" style={{ height: "350px" }}>
          
          
        </div>

        <div className="relative z-10 flex flex-col gap-6">
          {/* Peer KPI strip */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { key: "active",   label: "Active Peers",   value: topology?.activePeers, icon: Activity, iconClass: "text-success" },
              { key: "total",    label: "Total Peers",    value: topology?.totalPeers,  icon: Server,   iconClass: "text-accent"  },
              { key: "stale",    label: "Stale Peers",    value: topology?.stalePeers,  icon: WifiOff,  iconClass: "text-faint"    },
              { key: "services", label: "Total Services", value: stats?.totalServices,  icon: Layers,   iconClass: "text-info"    },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.key}
                  className="relative overflow-hidden rounded-2xl p-5 ring-1 ring-border transition-all duration-200 hover:ring-border-strong"
                  style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
                >
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-surface-muted">
                    <Icon className={`h-4 w-4 ${card.iconClass}`} />
                  </div>
                  {(topoLoading || statsLoading) ? (
                    <Skeleton lines={2} className="h-9 w-20" />
                  ) : (
                    <p className="text-3xl font-medium tabular-nums text-foreground">{card.value ?? 0}</p>
                  )}
                  <p className="mt-1 text-sm text-subtle">{card.label}</p>
                </div>
              );
            })}
          </div>

          {/* Secondary metrics row */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { key: "types", label: "Service Types",   value: stats?.uniqueServiceTypes, icon: Cpu,     iconClass: "text-info",    fmt: (v: number) => String(v) },
              { key: "fid",   label: "Avg Fidelity",    value: stats?.avgFidelity,        icon: Zap,     iconClass: "text-accent", fmt: (v: number) => `${(v * 100).toFixed(1)}%` },
              { key: "spp",   label: "Services / Peer", value: stats?.avgServicesPerPeer,  icon: Network, iconClass: "text-success",   fmt: (v: number) => v.toFixed(1) },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.key}
                  className="flex items-center gap-4 rounded-2xl p-4 ring-1 ring-border transition-all duration-200 hover:ring-border-strong"
                  style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-muted">
                    <Icon className={`h-4 w-4 ${card.iconClass}`} />
                  </div>
                  <div>
                    {statsLoading ? (
                      <Skeleton lines={1} className="h-7 w-14" />
                    ) : (
                      <p className="text-xl font-medium tabular-nums text-foreground">
                        {card.value != null ? card.fmt(card.value) : "-"}
                      </p>
                    )}
                    <p className="text-xs text-subtle">{card.label}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Graph */}
          {topoLoading ? (
            <Skeleton lines={6} className="h-48 w-full" />
          ) : (
            <Network3dGraph topology={topology ?? null} />
          )}

          {/* Peer list */}
          {!topoLoading && topology && topology.peers.length > 0 && (
            <section className="flex flex-col gap-3">
              <p className="text-xs font-medium text-faint">Connected Peers</p>
              <div className="flex flex-col gap-1.5">
                {topology.peers.map((peer) => (
                  <button
                    type="button"
                    key={peer.peerId}
                    onClick={() => setSelectedPeerId(peer.peerId)}
                    className="group relative flex w-full cursor-pointer items-center justify-between overflow-hidden rounded-2xl px-5 py-3.5 text-left ring-1 ring-border transition-all duration-200 hover:ring-border-strong hover:scale-[1.005]"
                    style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
                  >
                    <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    <div className="relative flex items-center gap-3">
                      {peer.isStale
                        ? <WifiOff className="h-4 w-4 shrink-0 text-faint" />
                        : <Wifi className="h-4 w-4 shrink-0 text-success" />
                      }
                      {peer.label ? (
                        <span className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">{peer.label}</span>
                          <span className="font-mono text-xs text-faint">{peer.peerId.slice(0, 32)}…</span>
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-subtle">{peer.peerId.slice(0, 32)}…</span>
                      )}
                    </div>
                    <div className="relative flex items-center gap-3">
                      <span className="text-xs capitalize text-faint">{peer.trustTier.replace(/_/g, " ")}</span>
                      <Badge
                        outline
                        className={
                          peer.healthStatus === "healthy"
                            ? "border-success/30 bg-success/10 text-success"
                            : "border-danger/30 bg-danger/10 text-danger"
                        }
                      >
                        {peer.healthStatus === "healthy"
                          ? <CheckCircle2 className="mr-1 h-3 w-3" />
                          : <AlertCircle className="mr-1 h-3 w-3" />
                        }
                        {peer.healthStatus}
                      </Badge>
                      <span className="flex items-center gap-1 text-xs text-faint">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(peer.lastSeenAt)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Service capabilities */}
          {!svcLoading && services.length > 0 && (
            <ServiceCapabilities services={services} onSelect={setSelectedService} />
          )}
        </div>
      </div>

      {/* ═══ Peer Detail Modal ═══ */}
      <Dialog open={selectedPeerId !== null} onOpenChange={(open) => { if (!open) setSelectedPeerId(null); }}>
        <DialogContent title="Peer Dossier">
<PageHeader
            icon={Server}
            title="Peer Dossier"
            description="Complete network intelligence for this peer node."
          />
          <div className="overflow-y-auto px-4 pb-4" style={{ maxHeight: "calc(85vh - 140px)" }}>
            {peerDetailLoading && (
              <div className="flex flex-col gap-3 pt-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton lines={2} key={i} className="h-10 w-full" />
                ))}
              </div>
            )}

          {peerDetail && (
            <div className="relative flex flex-col gap-4 pt-2">
              {/* Identity Section */}
              <ModalSection title="Identity" icon={Hash}>
                {peerDetail.label && <DetailField label="Label" value={peerDetail.label} />}
                <DetailField label="Peer ID" value={peerDetail.peerId} mono />
                <DetailField label="Trust Tier" value={peerDetail.trustTier.replace(/_/g, " ")} capitalize />
                <DetailField
                  label="Health"
                  value={peerDetail.healthStatus}
                  badge={peerDetail.healthStatus === "healthy" ? "emerald" : "red"}
                />
                <DetailField label="Rejoined" value={peerDetail.rejoined ? "Yes, this peer reconnected" : "No"} />
                <DetailField label="Log Position" value={String(peerDetail.peerLogPosition)} />
              </ModalSection>

              {/* Activity Section */}
              <ModalSection title="Activity" icon={Activity}>
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Active Reservations" value={peerDetail.activeReservations} />
                  <MiniStat label="Active Executions" value={peerDetail.activeExecutions} />
                </div>
                <DetailField label="Stale" value={peerDetail.isStale ? "Yes, not responding" : "No, active"} />
              </ModalSection>

              {/* Timing Section */}
              <ModalSection title="Timeline" icon={CalendarClock}>
                <DetailField label="First Seen" value={formatTimestamp(peerDetail.firstSeenAt)} />
                <DetailField label="Last Seen" value={formatTimestamp(peerDetail.lastSeenAt)} />
                <DetailField label="Last Advertisement" value={formatTimestamp(peerDetail.lastAdvertisementAt)} />
                <DetailField label="Last Heartbeat" value={formatTimestamp(peerDetail.lastHeartbeatAt)} />
              </ModalSection>

              {/* Network Section */}
              {peerDetail.networkAddresses.length > 0 && (
                <ModalSection title="Network Addresses" icon={MapPin}>
                  <div className="flex flex-col gap-1.5">
                    {peerDetail.networkAddresses.map((addr) => (
                      <div key={addr} className="rounded-lg bg-surface-muted px-3 py-2 ring-1 ring-border">
                        <span className="break-all font-mono text-xs text-subtle">{addr}</span>
                      </div>
                    ))}
                  </div>
                </ModalSection>
              )}

              {/* Protocols Section */}
              {peerDetail.supportedProtocols.length > 0 && (
                <ModalSection title="Supported Protocols" icon={Radio}>
                  <div className="flex flex-wrap gap-1.5">
                    {peerDetail.supportedProtocols.map((proto) => (
                      <span key={proto} className="rounded-md bg-accent/10 px-2 py-1 font-mono text-xs text-accent ring-1 ring-accent/20">
                        {proto}
                      </span>
                    ))}
                  </div>
                </ModalSection>
              )}

              {/* Services Section */}
              {peerDetail.serviceIds.length > 0 && (
                <ModalSection title="Registered Services" icon={Link2}>
                  <div className="flex flex-col gap-1.5">
                    {peerDetail.serviceIds.map((sid) => (
                      <div key={sid} className="rounded-lg bg-surface-muted px-3 py-2 ring-1 ring-border">
                        <span className="break-all font-mono text-xs text-subtle">{sid}</span>
                      </div>
                    ))}
                  </div>
                </ModalSection>
              )}
            </div>
          )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Service Detail Modal ═══ */}
      <Dialog open={selectedService !== null} onOpenChange={(open) => { if (!open) setSelectedService(null); }}>
        <DialogContent title="Service Specification">
<PageHeader
            icon={Zap}
            title="Service Specification"
            description="Full quantum service capabilities and configuration."
          />
          <div className="overflow-y-auto px-4 pb-4" style={{ maxHeight: "calc(85vh - 140px)" }}>

          {selectedService && (
            <div className="relative flex flex-col gap-4 pt-2">
              <ModalSection title="Overview" icon={Layers}>
                <DetailField label="Service Type" value={selectedService.serviceType.replace(/_/g, " ")} capitalize />
                <DetailField label="Node ID" value={selectedService.nodeId} mono />
                <DetailField
                  label="Availability"
                  value={selectedService.availability ? "Online" : "Offline"}
                  badge={selectedService.availability ? "emerald" : "red"}
                />
                <DetailField label="Last Updated" value={formatTimestamp(selectedService.updatedAt)} />
              </ModalSection>

              <ModalSection title="Quantum Specs" icon={Cpu}>
                <div className="grid grid-cols-3 gap-3">
                  <MiniStat label="Fidelity" value={`${(selectedService.fidelity * 100).toFixed(1)}%`} />
                  <MiniStat label="Min Qubits" value={selectedService.qubitMin} />
                  <MiniStat label="Max Qubits" value={selectedService.qubitMax} />
                </div>
                <DetailField label="Connectivity" value={selectedService.connectivity} capitalize />
              </ModalSection>

              {selectedService.gateSet.length > 0 && (
                <ModalSection title="Gate Set" icon={Shield}>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedService.gateSet.map((g) => (
                      <span key={g} className="rounded-md bg-accent/10 px-2.5 py-1 font-mono text-xs text-accent ring-1 ring-accent/20">
                        {g}
                      </span>
                    ))}
                  </div>
                </ModalSection>
              )}

              {selectedService.listenAddrs.length > 0 && (
                <ModalSection title="Listen Addresses" icon={MapPin}>
                  <div className="flex flex-col gap-1.5">
                    {selectedService.listenAddrs.map((addr) => (
                      <div key={addr} className="rounded-lg bg-surface-muted px-3 py-2 ring-1 ring-border">
                        <span className="break-all font-mono text-xs text-subtle">{addr}</span>
                      </div>
                    ))}
                  </div>
                </ModalSection>
              )}
            </div>
          )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══ Sub-components ═══ */

function ServiceCapabilities({ services, onSelect }: { services: ServiceNode[]; onSelect: (svc: ServiceNode) => void }) {
  const byType = new Map<string, ServiceNode>();
  for (const svc of services) {
    if (!byType.has(svc.serviceType)) byType.set(svc.serviceType, svc);
  }
  const unique = Array.from(byType.values()).sort((a, b) =>
    a.serviceType.localeCompare(b.serviceType)
  );

  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs font-medium text-faint">
        Service Capabilities
      </p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
        {unique.map((svc) => (
          <button
            type="button"
            key={svc.serviceType}
            onClick={() => onSelect(svc)}
            className="group relative flex cursor-pointer flex-col gap-2.5 overflow-hidden rounded-2xl p-4 text-left ring-1 ring-border transition-all duration-200 hover:ring-border-strong hover:scale-[1.01]"
            style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
          >
            <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="relative flex items-center justify-between">
              <span className="text-sm font-medium capitalize text-foreground">
                {svc.serviceType.replace(/_/g, " ")}
              </span>
              <span className="tabular-nums text-sm font-medium text-accent">
                {(svc.fidelity * 100).toFixed(1)}%
              </span>
            </div>
            <div className="relative flex items-center gap-2 text-xs text-faint">
              <span>{svc.qubitMin}–{svc.qubitMax} qubits</span>
              <span className="text-faint">·</span>
              <span className="capitalize">{svc.connectivity}</span>
            </div>
            {svc.gateSet.length > 0 && (
              <div className="relative flex flex-wrap gap-1">
                {svc.gateSet.map((g) => (
                  <span
                    key={g}
                    className="rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-subtle"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

function ModalSection({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-surface-muted p-3.5 ring-1 ring-border">
      <div className="flex items-center gap-2 text-subtle">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">{title}</span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function DetailField({ label, value, mono, capitalize: cap, badge }: {
  label: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
  badge?: "emerald" | "red";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-xs text-faint">{label}</span>
      {badge ? (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          badge ==="emerald"
            ? "bg-success/10 text-success ring-1 ring-success/20"
            : "bg-danger/10 text-danger ring-1 ring-danger/20"
        }`}>
          {cap ? value.charAt(0).toUpperCase() + value.slice(1) : value}
        </span>
      ) : (
        <span className={`text-right text-sm text-foreground ${mono ?"break-all font-mono text-xs" : ""} ${cap ? "capitalize" : ""}`}>
          {value}
        </span>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-muted px-3 py-2.5 ring-1 ring-border">
      <span className="text-lg font-medium tabular-nums text-foreground">{value}</span>
      <span className="text-center text-xs text-faint">{label}</span>
    </div>
  );
}
