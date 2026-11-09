// Pinata IPFS pinning — pins an existing CID by hash.
// Get JWT at: https://app.pinata.cloud → API Keys → New Key
// Set NEXT_PUBLIC_PINATA_JWT in .env

import type { PinningProvider, PinResult, QuotaInfo } from "../types";

const BASE_URL = "https://api.pinata.cloud";

function getToken(): string {
  const token = process.env.NEXT_PUBLIC_PINATA_JWT;
  if (!token)
    throw new Error(
      "Pinata JWT not set. Add NEXT_PUBLIC_PINATA_JWT to .env (get one at https://app.pinata.cloud → API Keys)",
    );
  return token;
}

class PinataService implements PinningProvider {
  name = "pinata" as const;
  displayName = "Pinata";

  async pin(cid: string, content?: Record<string, unknown>): Promise<PinResult> {
    // pinJSONToIPFS works on Pinata free tier; pinByHash requires paid plan
    const res = await fetch(`${BASE_URL}/pinning/pinJSONToIPFS`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pinataContent: content ?? { cid },
        pinataMetadata: { name: `vault-${cid.slice(0, 8)}` },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { details: res.statusText } }));
      throw new Error(`Pinata pin failed: ${err.error?.details || err.error?.reason || res.statusText}`);
    }

    const data = await res.json();
    return {
      cid: data.IpfsHash ?? cid,
      size: data.PinSize ?? 0,
      pinnedAt: new Date(data.Timestamp ?? Date.now()),
    };
  }

  async unpin(cid: string): Promise<void> {
    // The CID in our DB is the Helia CIDv1 (baga...). Pinata assigned its own
    // Qm... hash via pinJSONToIPFS. Look it up by the name we set at pin time.
    let pinataHash = cid;
    try {
      const listRes = await fetch(
        `${BASE_URL}/data/pinList?metadata[name]=vault-${cid.slice(0, 8)}&status=pinned`,
        { headers: { Authorization: `Bearer ${getToken()}` } },
      );
      if (listRes.ok) {
        const listData = await listRes.json();
        if (listData.rows?.length > 0) {
          pinataHash = listData.rows[0].ipfs_pin_hash;
        }
      }
    } catch {
      // fall through with original cid
    }

    const res = await fetch(`${BASE_URL}/pinning/unpin/${pinataHash}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error("Pinata unpin failed");
    }
  }

  async getQuota(): Promise<QuotaInfo> {
    const res = await fetch(`${BASE_URL}/data/userPinnedDataTotal`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error("Failed to fetch Pinata quota");
    const data = await res.json();
    return {
      used: data.pin_size_total ?? 0,
      total: 1_073_741_824, // 1 GB free tier
      itemCount: data.pin_count ?? 0,
    };
  }

  async testAuth(): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL}/data/testAuthentication`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export const pinataProvider = new PinataService();
