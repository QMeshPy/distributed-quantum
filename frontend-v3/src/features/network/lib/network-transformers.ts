import type {
  BackendPeerSummary,
  BackendPeerDetail,
  BackendTopologyResponse,
  BackendServiceResponse,
  BackendFidelityMetrics,
  BackendNetworkStats,
  PeerSummary,
  PeerDetail,
  NetworkTopology,
  ServiceNode,
  FidelityMetrics,
  NetworkStats,
} from "../types";

export function transformPeerSummary(p: BackendPeerSummary): PeerSummary {
  return {
    peerId: p.peer_id,
    trustTier: p.trust_tier,
    healthStatus: p.health_status,
    networkAddressCount: p.network_address_count,
    serviceCount: p.service_count,
    activeReservations: p.active_reservations,
    activeExecutions: p.active_executions,
    lastSeenAt: p.last_seen_at,
    isStale: p.is_stale,
  };
}

export function transformPeerDetail(p: BackendPeerDetail): PeerDetail {
  return {
    peerId: p.peer_id,
    trustTier: p.trust_tier,
    healthStatus: p.health_status,
    networkAddresses: p.network_addresses,
    supportedProtocols: p.supported_protocols,
    serviceIds: p.service_ids,
    activeReservations: p.active_reservations,
    activeExecutions: p.active_executions,
    peerLogPosition: p.peer_log_position,
    firstSeenAt: p.first_seen_at,
    lastSeenAt: p.last_seen_at,
    lastAdvertisementAt: p.last_advertisement_at,
    lastHeartbeatAt: p.last_heartbeat_at,
    rejoined: p.rejoined,
    isStale: p.is_stale,
  };
}

export function transformTopology(t: BackendTopologyResponse): NetworkTopology {
  const peers = (t.peers ?? []).map((p) => ({
    peerId: p.peer_id,
    trustTier: p.trust_tier,
    healthStatus: p.health_status,
    lastSeenAt: p.last_seen_at,
    isStale: p.is_stale ?? false,
  }));
  const activePeers = peers.filter((p) => !p.isStale).length;
  return {
    peers,
    totalPeers: t.total ?? peers.length,
    activePeers,
    stalePeers: peers.length - activePeers,
  };
}

export function transformService(s: BackendServiceResponse): ServiceNode {
  return {
    nodeId: s.node_id,
    listenAddrs: s.listen_addrs,
    serviceType: s.service_type,
    fidelity: s.fidelity,
    qubitMin: s.qubit_min,
    qubitMax: s.qubit_max,
    availability: s.availability,
    updatedAt: s.updated_at,
    gateSet: s.gate_set ?? [],
    connectivity: s.connectivity ?? "all-to-all",
  };
}

export function transformNetworkStats(s: BackendNetworkStats): NetworkStats {
  return {
    totalPeers: s.total_peers,
    activePeers: s.active_peers,
    stalePeers: s.stale_peers,
    totalServices: s.total_services,
    uniqueServiceTypes: s.unique_service_types,
    avgFidelity: s.avg_fidelity,
    avgServicesPerPeer: s.avg_services_per_peer,
    generatedAt: s.generated_at,
  };
}

export function transformFidelityMetrics(f: BackendFidelityMetrics): FidelityMetrics {
  return {
    nodeId: f.node_id,
    sampleCount: f.sample_count,
    averageFidelity: f.average_fidelity,
    minFidelity: f.min_fidelity,
    maxFidelity: f.max_fidelity,
    samples: f.samples.map((s) => ({
      serviceType: s.service_type,
      fidelity: s.fidelity,
      availability: s.availability,
      updatedAt: s.updated_at,
    })),
  };
}

export function getHealthBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "healthy") return "default";
  if (status === "degraded") return "secondary";
  if (status === "unhealthy" || status === "offline") return "destructive";
  return "outline";
}
