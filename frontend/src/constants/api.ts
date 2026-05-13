export const API = {
  AUTH: {
    ALL: "/api/auth/*",
    CHECK_EMAIL: "/api/auth/check-email",
  },
  DASHBOARD: {
    ROOT: "/api/dashboard",
    STATS: "/api/dashboard/stats",
    ACTIVITY: "/api/dashboard/activity",
  },
  RUNS: {
    LIST: "/api/runs",
    CREATE: "/api/runs",
    DETAIL: (id: string) => `/api/runs/${id}` as const,
    PLAN: (planId: string) => `/api/runs/plan/${planId}` as const,
  },
  OPTIONS: {
    LIST: "/api/options",
    CREATE: "/api/options",
    BATCH: "/api/options/batch",
    JOB: (jobId: string) => `/api/options/${jobId}` as const,
  },
  RISK: {
    LIST: "/api/risk",
    CREATE: "/api/risk",
    JOB: (jobId: string) => `/api/risk/${jobId}` as const,
  },
  FINANCE: {
    LIST: "/api/finance",
    CREATE: "/api/finance",
    JOB: (jobId: string) => `/api/finance/${jobId}` as const,
    COMPARISON: (jobId: string) =>
      `/api/finance/${jobId}/comparison` as const,
  },
  NETWORK: {
    TOPOLOGY: "/api/network/topology",
    PEERS: "/api/network/peers",
    PEER: (id: string) => `/api/network/peers/${id}` as const,
    SERVICES: "/api/network/services",
    FIDELITY: (nodeId: string) =>
      `/api/network/fidelity/${nodeId}` as const,
    STATS: "/api/network/stats",
    NODES_MINE: "/api/network/nodes/mine",
    NODE_SCRIPT: "/api/network/node-script",
  },
  VAULT: {
    PIN: "/api/vault/pin",
    UNPIN: (cid: string) => `/api/vault/pin/${cid}` as const,
    QUOTA: (service: string) => `/api/vault/quota/${service}` as const,
    PINS: "/api/vault/pins",
    PIN_METADATA: (cid: string) => `/api/vault/pins/${cid}` as const,
  },
  PHARMA: {
    LIST: "/api/pharma",
    SUBMIT: "/api/pharma",
    JOB: (id: string) => `/api/pharma/${id}` as const,
    CANCEL: (id: string) => `/api/pharma/${id}` as const,
    LIVE: (id: string) => `/api/pharma/${id}/live` as const,
  },
} as const;

