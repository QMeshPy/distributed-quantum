const BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8081";

export const BACKEND = {
  BASE_URL,
  HEALTH: `${BASE_URL}/api/v1/health`,
  READY: `${BASE_URL}/api/v1/ready`,
  BOOTSTRAP: {
    LIBP2P: `${BASE_URL}/api/v1/bootstrap/libp2p`,
    RUNTIME: `${BASE_URL}/api/v1/bootstrap/libp2p/runtime`,
  },
  CIRCUITS: {
    SUBMIT: `${BASE_URL}/api/v1/circuits/submit`,
  },
  JOBS: {
    LIST: `${BASE_URL}/api/v1/jobs`,
    DETAIL: (id: string) => `${BASE_URL}/api/v1/jobs/${id}` as const,
    PLAN: (planId: string) => `${BASE_URL}/api/v1/plans/${planId}` as const,
  },
  PLANS: {
    DETAIL: (id: string) => `${BASE_URL}/api/v1/plans/${id}` as const,
  },
  OPTIONS: {
    LIST: `${BASE_URL}/api/v1/options`,
    SUBMIT: `${BASE_URL}/api/v1/options/submit`,
    BATCH: `${BASE_URL}/api/v1/options/batch`,
    DETAIL: (id: string) => `${BASE_URL}/api/v1/options/${id}` as const,
  },
  RISK: {
    LIST: `${BASE_URL}/api/v1/risk`,
    SUBMIT: `${BASE_URL}/api/v1/risk/submit`,
    SUBMIT_CSV: `${BASE_URL}/api/v1/risk/submit-csv`,
    DETAIL: (id: string) => `${BASE_URL}/api/v1/risk/${id}` as const,
  },
  FINANCE: {
    LIST: `${BASE_URL}/api/v1/finance`,
    SUBMIT: `${BASE_URL}/api/v1/finance/submit`,
    DETAIL: (id: string) => `${BASE_URL}/api/v1/finance/${id}` as const,
    COMPARISON: (id: string) =>
      `${BASE_URL}/api/v1/finance/${id}/comparison` as const,
  },
  DISCOVERY: {
    PEERS: `${BASE_URL}/api/v1/discovery/peers`,
    PEER: (id: string) =>
      `${BASE_URL}/api/v1/discovery/peers/${id}` as const,
    TOPOLOGY: `${BASE_URL}/api/v1/discovery/topology`,
    NETWORK_TOPOLOGY: `${BASE_URL}/api/v1/discovery/network/topology`,
    STATS: `${BASE_URL}/api/v1/discovery/stats`,
  },
  SERVICES: {
    LIST: `${BASE_URL}/api/v1/services`,
    FIDELITY: (nodeId: string) =>
      `${BASE_URL}/api/v1/metrics/fidelity/${nodeId}` as const,
  },
  WORKFLOWS: {
    RUNS: `${BASE_URL}/api/v1/workflows/runs`,
    RUN: (id: string) => `${BASE_URL}/api/v1/workflows/runs/${id}` as const,
    BENCHMARKS: `${BASE_URL}/api/v1/workflows/benchmarks`,
    BENCHMARK: (id: string) =>
      `${BASE_URL}/api/v1/workflows/benchmarks/${id}` as const,
  },
  PHARMA: {
    SUBMIT: `${BASE_URL}/api/v1/pharma/submit`,
    LIST: `${BASE_URL}/api/v1/pharma/jobs`,
    JOB: (id: string) => `${BASE_URL}/api/v1/pharma/jobs/${id}` as const,
    CANCEL: (id: string) => `${BASE_URL}/api/v1/pharma/jobs/${id}` as const,
    LIVE: (id: string) => `${BASE_URL}/api/v1/pharma/jobs/${id}/live` as const,
  },
} as const;

export const BACKEND_AGENTKIT = {
  WALLET:          `${BASE_URL}/api/v1/wallet`,
  WALLET_CREATE:   `${BASE_URL}/api/v1/wallet/create`,
  WALLET_BALANCE:  `${BASE_URL}/api/v1/wallet/balance`,
  WALLET_TX:       `${BASE_URL}/api/v1/wallet/transactions`,
  WALLET_TRANSFER: `${BASE_URL}/api/v1/wallet/transfer`,
  PROPOSALS:       `${BASE_URL}/api/v1/proposals`,
  PROPOSAL:        (id: string) =>
    `${BASE_URL}/api/v1/proposals/${id}` as const,
  PROPOSAL_FUND:   (id: string) =>
    `${BASE_URL}/api/v1/proposals/${id}/invest` as const,
  PROPOSAL_FUND_PATH: (id: string) =>
    `${BASE_URL}/api/v1/proposals/${id}/fund` as const,
  MARKETPLACE:     `${BASE_URL}/api/v1/marketplace/workers`,
  AGENT_DETAIL:    (id: string) =>
    `${BASE_URL}/api/v1/marketplace/agents/${id}` as const,
  AGENTS:          `${BASE_URL}/api/v1/agents`,
  AGENT:           (id: string) =>
    `${BASE_URL}/api/v1/agents/${id}` as const,
  AGENT_ANALYZE:   (id: string) =>
    `${BASE_URL}/api/v1/agents/${id}/analyze` as const,
  NOTIFICATIONS:   `${BASE_URL}/api/v1/notifications`,
  NOTIF_READ:      (id: string) =>
    `${BASE_URL}/api/v1/notifications/${id}/read` as const,
} as const;
