export const QUERY_KEYS = {
  auth: {
    all: () => ["auth"] as const,
    session: () => ["auth", "session"] as const,
  },
  dashboard: {
    all: () => ["dashboard"] as const,
    overview: () => ["dashboard", "overview"] as const,
    networkStats: () => ["dashboard", "network-stats"] as const,
    stats: () => ["dashboard", "stats"] as const,
    activity: (limit: number) => ["dashboard", "activity", limit] as const,
  },
  runs: {
    all: () => ["runs"] as const,
    list: () => ["runs", "list"] as const,
    detail: (id: string) => ["runs", "detail", id] as const,
    quantumDetail: (id: string) => ["runs", "quantum-detail", id] as const,
  },
  options: {
    all: () => ["options"] as const,
    list: () => ["options", "list"] as const,
    job: (jobId: string) => ["options", "job", jobId] as const,
    batch: (batchId: string) => ["options", "batch", batchId] as const,
  },
  risk: {
    all: () => ["risk"] as const,
    list: () => ["risk", "list"] as const,
    job: (jobId: string) => ["risk", "job", jobId] as const,
  },
  finance: {
    all: () => ["finance"] as const,
    list: () => ["finance", "list"] as const,
    job: (jobId: string) => ["finance", "job", jobId] as const,
    comparison: (jobId: string) => ["finance", "comparison", jobId] as const,
  },
  network: {
    all: () => ["network"] as const,
    topology: () => ["network", "topology"] as const,
    peers: () => ["network", "peers"] as const,
    peer: (id: string) => ["network", "peer", id] as const,
    services: () => ["network", "services"] as const,
    fidelity: (nodeId: string) => ["network", "fidelity", nodeId] as const,
    stats: () => ["network", "stats"] as const,
    status: () => ["network", "status"] as const,
    nodes: () => ["network", "nodes"] as const,
  },
} as const;
