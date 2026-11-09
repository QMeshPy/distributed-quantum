import type { Helia } from "helia";
import type { CID } from "multiformats/cid";
import {
  parseVaultRecord,
  SchemaInvalidError,
  type VaultRecord,
  type VaultRecordKind,
} from "../schemas/vault-record.schema";
import { blockMatchesCid } from "./cid-verify";
import { getTrustlessGateways } from "./gateways";
import {
  CidVerificationError,
  fetchTrustlessBlock,
  GatewayUnreachableError,
} from "./trustless-fetch";

export class InvalidCidError extends Error {
  readonly code = "INVALID_CID" as const;
  constructor(input: string, cause?: unknown) {
    super(`Invalid CID: ${input}`);
    this.name = "InvalidCidError";
    if (cause instanceof Error) this.cause = cause;
  }
}

export type ResolveVaultCidResult = {
  cid: string;
  kind: VaultRecordKind;
  record: VaultRecord;
  /** True when block bytes were re-hashed and matched the CID. */
  verified: boolean;
  /** Where the block was obtained. */
  source: "local" | "gateway";
};

export type ResolveVaultCidOptions = {
  helia: Helia;
  gateways?: string[];
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

export async function parseCidString(input: string): Promise<CID> {
  const trimmed = input.trim();
  if (!trimmed) throw new InvalidCidError("(empty)");
  try {
    const { CID } = await import("multiformats/cid");
    return CID.parse(trimmed);
  } catch (err) {
    throw new InvalidCidError(trimmed, err);
  }
}

async function decodeVaultPayload(helia: Helia, cid: CID): Promise<unknown> {
  // Linked runs (#58), @helia/dag-json with CID links
  try {
    const { dagJson } = await import("@helia/dag-json");
    // Helia vs @helia/dag-json pull divergent multiformats/blockstore types.
    return await dagJson(helia as never).get(cid as never);
  } catch {
    // not dag-json
  }

  // Helia JSON codec (circuits / legacy Share-to-VAULT path)
  try {
    const { json } = await import("@helia/json");
    return await json(helia).get(cid);
  } catch {
    // Pinata / UnixFS JSON files (pinJSONToIPFS)
  }

  try {
    const { unixfs } = await import("@helia/unixfs");
    const toBuffer = (await import("it-to-buffer")).default;
    const buf = await toBuffer(unixfs(helia).cat(cid));
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    // Fall through
  }

  throw new SchemaInvalidError(
    "Block verified against CID but is not dag-json, Helia JSON, or a UnixFS JSON file",
  );
}

/**
 * Resolve a vault CID: validate → local cache or trustless gateway →
 * verify against CID → decode + schema-check the record.
 */
export async function resolveVaultCid(
  cidStr: string,
  options: ResolveVaultCidOptions,
): Promise<ResolveVaultCidResult> {
  const cid = await parseCidString(cidStr);
  const gateways = options.gateways ?? getTrustlessGateways();
  const { helia } = options;

  let bytes: Uint8Array;
  let source: "local" | "gateway";

  const hasLocal = await helia.blockstore.has(cid);
  if (hasLocal) {
    const toBuffer = (await import("it-to-buffer")).default;
    bytes = await toBuffer(helia.blockstore.get(cid));
    source = "local";
  } else {
    bytes = await fetchTrustlessBlock(cid, gateways, {
      fetchImpl: options.fetchImpl,
      signal: options.signal,
    });
    await helia.blockstore.put(cid, bytes);
    source = "gateway";
  }

  const verified = await blockMatchesCid(bytes, cid);
  if (!verified) {
    throw new CidVerificationError(cid.toString());
  }

  const decoded = await decodeVaultPayload(helia, cid);
  const { kind, record } = parseVaultRecord(decoded);

  return {
    cid: cid.toString(),
    kind,
    record,
    verified: true,
    source,
  };
}

export function isResolveError(
  err: unknown,
): err is
  | InvalidCidError
  | GatewayUnreachableError
  | CidVerificationError
  | SchemaInvalidError {
  return (
    err instanceof InvalidCidError ||
    err instanceof GatewayUnreachableError ||
    err instanceof CidVerificationError ||
    err instanceof SchemaInvalidError
  );
}

export {
  GatewayUnreachableError,
  CidVerificationError,
  SchemaInvalidError,
};
