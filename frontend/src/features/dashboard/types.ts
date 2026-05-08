export interface DashboardSummaryCard {
  id: string;
  title: string;
  value: string;
  description: string;
}

export interface DashboardServiceRow {
  nodeId: string;
  serviceType: string;
  fidelity: number;
  availability: boolean;
  qubitMin: number;
  qubitMax: number;
  listenAddrs: string[];
  updatedAt: string;
}

export interface DashboardNetworkStats {
  totalPeers: number;
  activePeers: number;
  totalServices: number;
  averageFidelity: number;
}

export interface DashboardHealthSummary {
  status: string;
  service: string;
  version: string;
  environment: string;
  uptimeSeconds: number;
}

export interface DashboardSnapshot {
  generatedAt: string;
  warnings: string[];
  health: DashboardHealthSummary | null;
  summaryCards: DashboardSummaryCard[];
  services: DashboardServiceRow[];
  networkStats: DashboardNetworkStats;
}
