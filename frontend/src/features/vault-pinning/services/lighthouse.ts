// Lighthouse Storage — direct file upload, returns IPFS CID.
// Unlike Pinata's pinByHash, Lighthouse uploads the content itself;
// no separate pin step is needed.
//
// Shown to users as "Filecoin (via Lighthouse)"; the id stays "lighthouse"
// so existing pin records keep working.
//
// Get an API key at: https://files.lighthouse.storage → API Keys
// Set NEXT_PUBLIC_LIGHTHOUSE_KEY in .env

import type { PinningProvider, PinResult, QuotaInfo } from "../types";

const UPLOAD_URL = "https://upload.lighthouse.storage/api/v0/add";
const API_URL = "https://api.lighthouse.storage";

function getKey(): string {
  const key = process.env.NEXT_PUBLIC_LIGHTHOUSE_KEY;
  if (!key)
    throw new Error(
      "Lighthouse API key not set. Add NEXT_PUBLIC_LIGHTHOUSE_KEY to .env (get one at https://files.lighthouse.storage)",
    );
  return key;
}

class LighthouseProvider implements PinningProvider {
  name = "lighthouse" as const;
  displayName = "Filecoin (via Lighthouse)";

  async pin(cid: string, content?: Record<string, unknown>): Promise<PinResult> {
    const blob = new Blob(
      [JSON.stringify(content ?? { cid })],
      { type: "application/json" },
    );

    const form = new FormData();
    form.append("file", blob, `vault-${cid.slice(0, 8)}.json`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    let res: Response;
    try {
      res = await fetch(UPLOAD_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${getKey()}` },
        body: form,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("Lighthouse upload timed out (>30 s). Check your connection and retry.");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Lighthouse upload failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    // Lighthouse returns { Name, Hash, Size }
    return {
      cid: data.Hash ?? cid,
      size: Number(data.Size ?? 0),
      pinnedAt: new Date(),
    };
  }

  async unpin(_cid: string): Promise<void> {
    // Lighthouse does not support unpin via REST API; files expire or are
    // managed via the dashboard. No-op keeps the UI flow intact.
  }

  async getQuota(): Promise<QuotaInfo> {
    try {
      const res = await fetch(`${API_URL}/api/user/user_data_usage`, {
        headers: { Authorization: `Bearer ${getKey()}` },
      });
      if (!res.ok) throw new Error("Quota fetch failed");
      const data = await res.json();
      return {
        used: data.dataUsed ?? 0,
        total: data.dataLimit ?? null,
        itemCount: 0,
      };
    } catch {
      return { used: 0, total: null, itemCount: 0 };
    }
  }

  async testAuth(): Promise<boolean> {
    try {
      const res = await fetch(`${API_URL}/api/user/user_data_usage`, {
        headers: { Authorization: `Bearer ${getKey()}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export const lighthouseProvider = new LighthouseProvider();
