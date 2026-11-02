"use client";

import { useState } from "react";
import { useHeliaContext } from "../provider";
import { getVaultJson } from "../lib/run-circuit-link";
import { materializeRunRecord, normalizeCircuitCid } from "../lib/run-record";

export function useIpfsFetch() {
  const { helia, ready } = useHeliaContext();
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async <T = unknown>(cidStr: string): Promise<T | null> => {
    if (!helia || !ready) {
      setError(new Error("Helia not ready"));
      return null;
    }

    setFetching(true);
    setError(null);

    try {
      const { CID } = await import("multiformats/cid");
      const cid = CID.parse(cidStr);
      const data = await getVaultJson(helia, cid);

      // Materialize run records so circuitCid is always a string for UI.
      if (
        data &&
        typeof data === "object" &&
        "circuitCid" in data &&
        !("qasm" in data)
      ) {
        const run = materializeRunRecord(data);
        return run as T;
      }

      // Legacy string circuitCid may already be fine; normalize if present.
      if (data && typeof data === "object" && "circuitCid" in data) {
        const obj = data as Record<string, unknown>;
        return {
          ...obj,
          circuitCid: normalizeCircuitCid(
            obj.circuitCid as Parameters<typeof normalizeCircuitCid>[0],
          ),
        } as T;
      }

      return data as T;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      return null;
    } finally {
      setFetching(false);
    }
  };

  return { fetchData, fetching, error, ready };
}
