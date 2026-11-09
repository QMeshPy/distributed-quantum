import type { CID } from "multiformats/cid";
import { blockMatchesCid } from "./cid-verify";

export class GatewayUnreachableError extends Error {
  readonly code = "GATEWAY_UNREACHABLE" as const;
  readonly gateways: string[];

  constructor(gateways: string[], cause?: unknown) {
    const list = gateways.join(", ") || "(none configured)";
    super(`Could not fetch block from trustless gateways: ${list}`);
    this.name = "GatewayUnreachableError";
    this.gateways = gateways;
    if (cause instanceof Error) this.cause = cause;
  }
}

export class CidVerificationError extends Error {
  readonly code = "CID_MISMATCH" as const;
  constructor(cid: string) {
    super(`Fetched block does not match CID ${cid}`);
    this.name = "CidVerificationError";
  }
}

type FetchLike = typeof fetch;

function candidateUrls(gateway: string, cid: CID): string[] {
  const base = gateway.replace(/\/+$/, "");
  const path = `${base}/ipfs/${cid.toString()}`;
  // ?format=raw is required on some gateways (e.g. Pinata) to get the true
  // IPLD block instead of a deserialized file body.
  return [`${path}?format=raw`, path];
}

/**
 * Fetch a raw IPLD block from trustless HTTP gateways.
 * Tries each gateway; verifies the bytes against the CID before returning.
 */
export async function fetchTrustlessBlock(
  cid: CID,
  gateways: string[],
  options: {
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<Uint8Array> {
  if (gateways.length === 0) {
    throw new GatewayUnreachableError([]);
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const errors: unknown[] = [];

  for (const gateway of gateways) {
    for (const url of candidateUrls(gateway, cid)) {
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      options.signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetchImpl(url, {
          method: "GET",
          headers: { Accept: "application/vnd.ipld.raw" },
          signal: controller.signal,
        });
        if (!res.ok) {
          errors.push(new Error(`${url} → HTTP ${res.status}`));
          continue;
        }
        const buf = new Uint8Array(await res.arrayBuffer());
        if (!(await blockMatchesCid(buf, cid))) {
          // Deserialized file bodies (common without ?format=raw) must not
          // be treated as verified blocks — try the next candidate.
          errors.push(new Error(`${url} → body does not match CID`));
          continue;
        }
        return buf;
      } catch (err) {
        if (err instanceof CidVerificationError) throw err;
        errors.push(err);
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
      }
    }
  }

  throw new GatewayUnreachableError(gateways, errors[errors.length - 1]);
}
