// --- Backend (snake_case) types ---

export interface BackendPeerSummary {
  peer_id: string;
  trust_tier: string;
  health_status: string;
  network_address_count: number;
  service_count: number;
  active_reservations: number;
  active_executions: number;
  last_seen_at: string;
  is_stale: boolean;
}

export interface BackendPeerDetail {
  peer_id: string;
  trust_tier: string;
  health_status: string;
  network_addresses: string[];
  supported_protocols: string[];
  service_ids: string[];
  active_reservations: number;
  active_executions: number;
  peer_log_position: number;
  first_seen_at: string;
  last_seen_at: string;
  last_advertisement_at: string | null;
  last_heartbeat_at: string | null;
  rejoined: boolean;
  is_stale: boolean;
}

export interface BackendPeerListResponse {
  peers: BackendPeerSummary[];
  total: number;
  include_stale: boolean;
}

export interface BackendTopologyEntry {
  peer_id: string;
  trust_tier: string;
  health_status: string;
  last_seen_at: string;
  is_stale: boolean;
}

export interface BackendTopologyResponse {
  peers: BackendTopologyEntry[];
  total: number;
  include_stale: boolean;
}

export interface BackendNetworkTopologyResponse {
  fabric_running: boolean;
  generated_at: string;
  services: Array<Record<string, unknown>>;
  registry_snapshot: Array<Record<string, unknown>>;
}

export interface BackendServiceResponse {
  node_id: string;
  listen_addrs: string[];
  service_type: string;
  fidelity: number;
  qubit_min: number;
  qubit_max: number;
  gate_set?: string[];
  connectivity?: string;
  availability: boolean;
  updated_at: string;
}

export interface BackendFidelitySample {
  service_type: string;
  fidelity: number;
  availability: boolean;
  updated_at: string;
}

export interface BackendFidelityMetrics {
  node_id: string;
  sample_count: number;
  average_fidelity: number;
  min_fidelity: number;
  max_fidelity: number;
  samples: BackendFidelitySample[];
}

export interface BackendHealthResponse {
  status: string;
  service: string;
  environment: string;
  version: string;
  uptime_seconds: number;
}

// --- UI-facing camelCase types ---

export interface PeerSummary {
  peerId: string;
  trustTier: string;
  healthStatus: string;
  networkAddressCount: number;
  serviceCount: number;
  activeReservations: number;
  activeExecutions: number;
  lastSeenAt: string;
  isStale: boolean;
}

export interface PeerDetail {
  peerId: string;
  trustTier: string;
  healthStatus: string;
  networkAddresses: string[];
  supportedProtocols: string[];
  serviceIds: string[];
  activeReservations: number;
  activeExecutions: number;
  peerLogPosition: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastAdvertisementAt: string | null;
  lastHeartbeatAt: string | null;
  rejoined: boolean;
  isStale: boolean;
}

export interface ServiceNode {
  nodeId: string;
  listenAddrs: string[];
  serviceType: string;
  fidelity: number;
  qubitMin: number;
  qubitMax: number;
  availability: boolean;
  updatedAt: string;
  gateSet: string[];
  connectivity: string;
}

export interface FidelityMetrics {
  nodeId: string;
  sampleCount: number;
  averageFidelity: number;
  minFidelity: number;
  maxFidelity: number;
  samples: Array<{
    serviceType: string;
    fidelity: number;
    availability: boolean;
    updatedAt: string;
  }>;
}

export interface NetworkTopology {
  peers: Array<{
    peerId: string;
    trustTier: string;
    healthStatus: string;
    lastSeenAt: string;
    isStale: boolean;
  }>;
  totalPeers: number;
  activePeers: number;
  stalePeers: number;
}

export interface HealthSummary {
  status: string;
  service: string;
  environment: string;
  version: string;
  uptimeSeconds: number;
}

export interface BackendNetworkStats {
  total_peers: number;
  active_peers: number;
  stale_peers: number;
  total_services: number;
  unique_service_types: number;
  avg_fidelity: number;
  avg_services_per_peer: number;
  generated_at: string;
}

export interface NetworkStats {
  totalPeers: number;
  activePeers: number;
  stalePeers: number;
  totalServices: number;
  uniqueServiceTypes: number;
  avgFidelity: number;
  avgServicesPerPeer: number;
  generatedAt: string;
}
