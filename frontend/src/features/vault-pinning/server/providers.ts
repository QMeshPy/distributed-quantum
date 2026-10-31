import "server-only";

import { CID } from "multiformats/cid";
import type { PinningService, PinResult } from "../types";

export class StorageError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
  }
}

function pinataHeaders(): Record<string, string> {
  if (process.env.PINATA_JWT) return { Authorization: `Bearer ${process.env.PINATA_JWT}` };
  if (process.env.PINATA_API_KEY && process.env.PINATA_API_SECRET) {
    return { pinata_api_key: process.env.PINATA_API_KEY, pinata_secret_api_key: process.env.PINATA_API_SECRET };
  }
  throw new StorageError("Configure PINATA_JWT or PINATA_API_KEY and PINATA_API_SECRET on the server.", 503);
}

function lighthouseHeaders(): Record<string, string> {
  if (!process.env.LIGHTHOUSE_API_KEY) {
    throw new StorageError("Configure LIGHTHOUSE_API_KEY on the server.", 503);
  }
  return { Authorization: `Bearer ${process.env.LIGHTHOUSE_API_KEY}` };
}

async function providerFetch(url: string, init: RequestInit, label: string): Promise<Response> {
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new StorageError(`${label} failed (${response.status}). Check the provider configuration and quota.`);
    }
    return response;
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError(`${label} failed or timed out. Retry shortly.`);
  }
}

function pinResult(cid: unknown, size: unknown): PinResult {
  try {
    if (typeof cid !== "string") throw new Error();
    CID.parse(cid);
    if ((typeof size !== "number" && typeof size !== "string") || size === "") throw new Error();
    const bytes = Number(size);
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error();
    return { cid, size: bytes, pinnedAt: new Date() };
  } catch {
    throw new StorageError("Storage provider returned an invalid pin result.");
  }
}

const pinataProvider = {
  displayName: "Pinata",
  async pin(cid: string, content: Record<string, unknown>): Promise<PinResult> {
    const response = await providerFetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: { ...pinataHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ pinataContent: content, pinataMetadata: { name: `vault-${cid}` } }),
    }, "Pinata upload");
    const data = await response.json().catch(() => null);
    return pinResult(data?.IpfsHash, data?.PinSize);
  },
};

const lighthouseProvider = {
  displayName: "Filecoin (via Lighthouse)",
  async pin(cid: string, content: Record<string, unknown>): Promise<PinResult> {
    const headers = lighthouseHeaders();
    const form = new FormData();
    form.append("file", new Blob([JSON.stringify(content)], { type: "application/json" }), `vault-${cid}.json`);
    const response = await providerFetch("https://upload.lighthouse.storage/api/v0/add", {
      method: "POST", headers, body: form,
    }, "Lighthouse upload");
    const data = await response.json().catch(() => null);
    return pinResult(data?.Hash, data?.Size);
  },
};

export function getProvider(service: PinningService) {
  // Existing nft.storage records were uploaded to Pinata; retain that service ID.
  return service === "lighthouse" ? lighthouseProvider : pinataProvider;
}
