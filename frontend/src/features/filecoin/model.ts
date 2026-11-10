import { z } from "zod";

export const receiptSchema = z.object({
  network: z.literal("calibration"),
  chain_id: z.literal(314159),
  piece_cid: z.string().regex(/^b[a-z2-7]{9,255}$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size_bytes: z
    .number()
    .int()
    .min(1)
    .max(16 * 1024 * 1024),
  complete: z.boolean(),
  copies: z
    .array(
      z.object({
        provider_id: z.string(),
        data_set_id: z.string(),
        piece_id: z.string(),
        transaction_hash: z.string().nullable().optional(),
        provider_address: z.string().nullable().optional(),
        retrieval_url: z.string().nullable().optional(),
      }),
    )
    .max(2),
  transaction_hashes: z.array(z.string()),
  payer_address: z.string().nullable().optional(),
});
export type FilecoinReceipt = z.infer<typeof receiptSchema>;
export function parseReceipt(value: unknown): FilecoinReceipt {
  const parsed = receiptSchema.safeParse(value);
  if (!parsed.success)
    throw new Error("Choose a valid Filecoin Calibration receipt JSON file.");
  return parsed.data;
}

export type StorageAccount = {
  agent_id: string;
  agent_name?: string;
  address: string;
  max_monthly_usdfc: string;
  max_lockup_usdfc: string;
  max_deposit_usdfc: string;
  retention_days: number;
};
export type StoredArtifact = {
  operation_id: string;
  agent_id: string;
  state: string;
  created_at?: string;
  result?: FilecoinReceipt;
  submitted_receipt?: FilecoinReceipt | null;
};
export type ProofCopy = {
  registered?: boolean;
  live?: boolean;
  proof_status?: string;
  provider_id?: string;
  data_set_id?: string;
};
export type StorageStatus = {
  retrieval: string;
  possession: { observed_at?: string; copies?: ProofCopy[] };
};
export type VerificationReport = {
  status: string;
  checks: { kind: string; name: string; status: string; message: string }[];
};
export type AccountBalance = {
  tfil_base_units: string;
  usdfc_base_units: string;
  account: {
    funds: string;
    availableFunds: string;
    lockupRatePerMonth: string;
  };
  approval: { isApproved: boolean };
};
export type PendingWrite = {
  operation_id: string;
  agent_id: string;
  label: string;
  started_at: string;
};

export function pendingKey(userId: string) {
  return `qmesh-filecoin-pending:${userId}`;
}
export function readPending(
  storage: Pick<Storage, "getItem">,
  userId: string,
): PendingWrite | null {
  const value = storage.getItem(pendingKey(userId));
  if (!value) return null;
  const parsed = z
    .object({
      operation_id: z.string().min(8).max(128),
      agent_id: z.string().min(1).max(128),
      label: z.string(),
      started_at: z.string(),
    })
    .safeParse(JSON.parse(value));
  if (!parsed.success)
    throw new Error(
      "The saved storage operation is unreadable. Reconcile it before submitting another write.",
    );
  return parsed.data;
}
export function formatToken(value?: string): string {
  if (!value || !/^\d+$/.test(value)) return "—";
  const units = BigInt(value);
  const scale = BigInt("1000000000000000000");
  const fraction = (units % scale)
    .toString()
    .padStart(18, "0")
    .slice(0, 6)
    .replace(/0+$/, "");
  return `${units / scale}${fraction ? `.${fraction}` : ""}`;
}
export function proofLabel(copy: ProofCopy): string {
  if (!copy.registered) return "Piece not registered";
  if (!copy.live) return "Dataset inactive";
  if (copy.proof_status === "proven_this_period") return "Proven this period";
  if (copy.proof_status === "pending_this_period")
    return "Awaiting this period’s proof";
  return "Proof unavailable";
}
export function anchorLabel(report: VerificationReport): string {
  const checks = report.checks.filter((check) => check.kind === "anchor");
  if (
    !checks.length ||
    checks.every((check) => check.status === "not_applicable")
  )
    return "No NEAR anchor recorded";
  if (checks.some((check) => check.status === "failed"))
    return "Anchor verification failed";
  if (checks.every((check) => check.status === "passed"))
    return "Recorded anchors verified";
  return "Anchor verification unavailable";
}
export function transactionUrl(hash: string): string | null {
  return /^0x[0-9a-fA-F]{64}$/.test(hash)
    ? `https://beryx.io/fil/calibration/txs/${hash}`
    : null;
}

export class FilecoinRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function requestFilecoin<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/filecoin/${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      typeof result?.detail === "string" ? result.detail : result?.error;
    throw new FilecoinRequestError(
      typeof detail === "string"
        ? detail
        : "The storage service could not complete this request.",
      response.status,
    );
  }
  return result as T;
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
