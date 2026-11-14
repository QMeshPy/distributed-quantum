import { API_AGENTKIT } from "@/constants/api";

/** What the backend needs confirmed before it signs the NEAR `anchor` call. */
export type NearPublishRequest = {
  request_id: string;
  /** Text the user's Ethereum wallet signs; null when the account has no linked wallet. */
  message?: string | null;
  submitter?: string | null;
};

export type NearPublication = {
  published: true;
  explorer_url: string;
  tx_hash: string;
  merkle_root: string;
  submitter?: string | null;
  wallet_signed?: boolean;
};

type Prepared =
  | NearPublication
  | (NearPublishRequest & { status: "awaiting_user_confirmation" })
  | { status: "awaiting_signature" };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? body.detail ?? body.error ?? "NEAR publishing failed");
  return body as T;
}

function utf8Hex(text: string): string {
  return "0x" + Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Ask the connected wallet (MetaMask etc.) to sign the publication statement, then let the
 * backend publish. Without a browser wallet it publishes unsigned: the address is still shown
 * as the submitter, but not proven by a signature.
 */
export async function signAndPublish(request: NearPublishRequest): Promise<NearPublication> {
  let signature: string | null = null;
  const wallet = typeof window === "undefined" ? undefined : window.ethereum;
  if (request.message && request.submitter && wallet) {
    const accounts = (await wallet.request({ method: "eth_requestAccounts" })) as string[];
    const account = accounts.find((a) => a.toLowerCase() === request.submitter!.toLowerCase());
    if (!account) {
      throw new Error(
        `Switch your wallet to ${request.submitter}; these experiments are attributed to that address.`,
      );
    }
    signature = (await wallet.request({
      method: "personal_sign",
      params: [utf8Hex(request.message), account],
    })) as string;
  }
  return call<NearPublication>(API_AGENTKIT.NEAR_PUBLISH(request.request_id), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signature }),
  });
}

/** Prepare, sign and publish experiments in one go (Lab page buttons). */
export async function publishExperiments(jobIds: string[]): Promise<NearPublication> {
  const prepared = await call<Prepared>(API_AGENTKIT.NEAR_PREPARE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_ids: jobIds }),
  });
  if ("published" in prepared) return prepared;
  if (prepared.status === "awaiting_signature") {
    throw new Error("Automatic NEAR publishing is not configured on this server yet.");
  }
  return signAndPublish(prepared);
}

export async function fetchNearPublication(
  jobId: string,
): Promise<NearPublication | { published: false }> {
  return call(API_AGENTKIT.NEAR_STATUS(jobId));
}

/** Chat message shown after a successful publication. */
export function publicationMessage(result: NearPublication): string {
  const by = result.submitter
    ? result.wallet_signed
      ? `Signed by your wallet \`${result.submitter}\`.`
      : `Attributed to \`${result.submitter}\` (not wallet-signed).`
    : "No wallet linked, so no submitter address is attached.";
  return [
    "**Published to NEAR testnet.**",
    "",
    `- Transaction: [${result.tx_hash.slice(0, 10)}…](${result.explorer_url})`,
    `- Merkle root: \`${result.merkle_root}\``,
    `- ${by}`,
    "",
    `[View on NearBlocks](${result.explorer_url})`,
  ].join("\n");
}
