export type PinningService = "nft.storage" | "pinata";

export interface PinningProvider {
  name: PinningService;
  displayName: string;
  pin(cid: string): Promise<PinResult>;
  unpin(cid: string): Promise<void>;
  getQuota(): Promise<QuotaInfo>;
  testAuth(): Promise<boolean>;
}

export interface PinResult {
  cid: string;
  size: number;
  pinnedAt: Date;
}

export interface QuotaInfo {
  used: number;
  total: number | null;
  itemCount: number;
}

export interface PinAuditRecord {
  userId: string;
  cid: string;
  service: PinningService;
  action: "pin" | "unpin" | "migrate";
  size: number;
  sizeSource: "estimated" | "actual";
  type: "circuit" | "run";
  metadata: Record<string, unknown>;
  timestamp: Date;
  syncStatus: "pending" | "synced" | "failed";
  error?: string;
}

export interface PinMetadata {
  cid: string;
  service: PinningService;
  pinnedAt: Date;
  size: number;
}

export interface PinButtonState {
  status: "unpinned" | "pinning" | "pinned" | "error";
  service?: PinningService;
  size?: number;
  error?: string;
}
