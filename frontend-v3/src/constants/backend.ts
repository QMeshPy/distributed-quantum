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
} as const;
