"use client";

import { useState } from "react";
import { useHeliaContext } from "../provider";
import { addToIndex } from "../lib/local-index";

export function useIpfsUpload() {
  const { helia, ready } = useHeliaContext();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

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
      const { json } = await import("@helia/json");
      const j = json(helia);
      const cid = await j.add(data);
      const cidStr = cid.toString();

      addToIndex({ cid: cidStr, type, name });

      return cidStr;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      return null;
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading, error, ready };
}
