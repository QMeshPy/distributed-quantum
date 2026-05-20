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
    myNodes: () => ["network", "my-nodes"] as const,
  },
  vault: {
    all: () => ["vault"] as const,
    circuits: () => ["vault", "circuits"] as const,
    runs: () => ["vault", "runs"] as const,
    myCircuits: () => ["vault", "my-circuits"] as const,
    myRuns: () => ["vault", "my-runs"] as const,
    circuitDetail: (cid: string) => ["vault", "circuit", cid] as const,
    runDetail: (cid: string) => ["vault", "run", cid] as const,
    quota: (service: string) => ["vault", "quota", service] as const,
    pinMetadata: (cid: string) => ["vault", "pin-metadata", cid] as const,
    pins: () => ["vault", "pins"] as const,
  },
  pharma: {
    all: () => ["pharma"] as const,
    list: () => ["pharma", "list"] as const,
    job: (id: string) => ["pharma", "job", id] as const,
    live: (id: string) => ["pharma", "live", id] as const,
  },
} as const;


export const QUERY_KEYS_AGENTKIT = {
  wallet: () => ["agentkit", "wallet"] as const,
  proposals: () => ["agentkit", "proposals"] as const,
  proposal: (id: string) => ["agentkit", "proposals", id] as const,
  marketplace: () => ["agentkit", "marketplace"] as const,
  agent: (id: string) => ["agentkit", "agents", id] as const,
  notifications: () => ["agentkit", "notifications"] as const,
} as const;
