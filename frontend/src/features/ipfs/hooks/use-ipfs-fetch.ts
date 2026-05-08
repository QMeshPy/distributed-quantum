"use client";

import { useState } from "react";
import { useHeliaContext } from "../provider";

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
      const { json } = await import("@helia/json");
      const { CID } = await import("multiformats/cid");
      const j = json(helia);
      const cid = CID.parse(cidStr);
      const data = await j.get(cid);
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
