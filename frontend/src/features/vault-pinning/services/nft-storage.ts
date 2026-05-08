import type { PinningProvider, PinResult, QuotaInfo } from "../types";

const BASE_URL = "https://api.nft.storage";

function getToken(): string {
  const token = process.env.NEXT_PUBLIC_NFT_STORAGE_TOKEN;
  if (!token) throw new Error("NFT.Storage API token not configured");
  return token;
}

class NFTStorageProvider implements PinningProvider {
  name = "nft.storage" as const;
  displayName = "NFT.Storage";

  async pin(cid: string): Promise<PinResult> {
    const res = await fetch(`${BASE_URL}/pins`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cid, name: `vault-${cid.slice(0, 8)}` }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(
        `NFT.Storage pin failed: ${err.message || res.statusText}`,
      );
    }

    const data = await res.json();
    return {
      cid: data.value?.cid ?? cid,
      size: data.value?.size ?? 0,
      pinnedAt: new Date(data.value?.created ?? Date.now()),
    };
  }

  async unpin(cid: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/pins/${cid}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    if (!res.ok && res.status !== 404) {
      throw new Error("NFT.Storage unpin failed");
    }
  }

  async getQuota(): Promise<QuotaInfo> {
    const res = await fetch(`${BASE_URL}/user/account`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    if (!res.ok) throw new Error("Failed to fetch NFT.Storage quota");

    const data = await res.json();
    return {
      used: data.value?.storageUsed ?? 0,
      total: null,
      itemCount: data.value?.pinCount ?? 0,
    };
  }

  async testAuth(): Promise<boolean> {
    try {
      await this.getQuota();
      return true;
    } catch {
      return false;
    }
  }
}

export const nftStorageProvider = new NFTStorageProvider();
