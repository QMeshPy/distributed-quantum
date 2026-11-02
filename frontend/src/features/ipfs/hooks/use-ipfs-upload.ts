"use client";

import { useState } from "react";
import { useHeliaContext } from "../provider";
import { addToIndex } from "../lib/local-index";
import {
  buildRunRecord,
  linkifyRunForDagJson,
  normalizeCircuitCid,
} from "../lib/run-record";
import { notifyVaultIndexChanged } from "./use-local-vault-index";

export function useIpfsUpload() {
  const { helia, ready, error: heliaError } = useHeliaContext();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Derive a human-readable status for the VAULT connection
  const heliaStatus: string = heliaError
    ? `VAULT error: ${heliaError.message}`
    : ready
      ? "VAULT ready"
      : "VAULT is initializing (Helia / libp2p booting…)";

  const upload = async (
    data: Record<string, unknown>,
    name: string,
    type: "circuit" | "run",
  ): Promise<string | null> => {
    if (!helia || !ready) {
      setError(new Error("Helia not ready"));
      return null;
    }

    setUploading(true);
    setError(null);

    try {
      let cidStr: string;

      if (type === "run") {
        // Runs are dag-json with an IPLD link to the circuit (#58).
        let circuitCid = normalizeCircuitCid(
          data.circuitCid as Parameters<typeof normalizeCircuitCid>[0],
        );

        // If the share payload has OpenQASM but no circuit CID, store the circuit
        // first (same fields as a vault circuit record) then link it.
        if (!circuitCid && typeof data.circuitText === "string" && data.circuitText.trim()) {
          const { json } = await import("@helia/json");
          const circuitCidObj = await json(helia).add({
            name: `${name} circuit`,
            description: "",
            qasm: data.circuitText,
            qubitCount: Number(data.qubitCount ?? 0),
            gateCount: 0,
            author: String(data.author ?? "anonymous"),
            publishedAt: new Date().toISOString(),
            tags: [],
          });
          circuitCid = circuitCidObj.toString();
          addToIndex({
            cid: circuitCid,
            type: "circuit",
            name: `${name} circuit`,
          });
        }

        const record = buildRunRecord({
          name,
          circuitCid,
          qubitCount: Number(data.qubitCount ?? 0),
          peerCount: Number(data.peerCount ?? 0),
          runtime: Number(data.runtime ?? 0),
          status: String(data.status ?? "completed"),
          author: String(data.author ?? "anonymous"),
          publishedAt:
            typeof data.publishedAt === "string"
              ? data.publishedAt
              : new Date().toISOString(),
          results:
            data.results && typeof data.results === "object"
              ? (data.results as Record<string, unknown>)
              : undefined,
        });

        const linked = await linkifyRunForDagJson(record);
        const { dagJson } = await import("@helia/dag-json");
        // Helia vs @helia/dag-json pull divergent multiformats/blockstore types.
        const cid = await dagJson(helia as never).add(linked);
        cidStr = cid.toString();
      } else {
        const { json } = await import("@helia/json");
        const cid = await json(helia).add(data);
        cidStr = cid.toString();
      }

      addToIndex({ cid: cidStr, type, name });
      notifyVaultIndexChanged();

      return cidStr;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      return null;
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading, error, ready, heliaStatus };
}
