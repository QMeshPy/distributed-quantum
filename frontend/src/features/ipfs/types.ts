export interface CircuitIPFSRecord {
  cid: string;
  name: string;
  description: string;
  qasm: string;
  qubitCount: number;
  gateCount: number;
  author: string;
  publishedAt: string;
  tags: string[];
}

export interface RunIPFSRecord {
  cid: string;
  name: string;
  circuitCid: string;
  qubitCount: number;
  peerCount: number;
  runtime: number;
  status: string;
  author: string;
  publishedAt: string;
  results?: Record<string, unknown>;
}

export interface VaultItem {
  cid: string;
  type: "circuit" | "run";
  name: string;
  addedAt: string;
  size?: number;
}

export interface LocalVaultIndex {
  items: VaultItem[];
  lastUpdated: string;
}
