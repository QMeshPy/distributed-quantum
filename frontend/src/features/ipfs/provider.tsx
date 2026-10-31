"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Helia } from "helia";
import { toast } from "sonner";

interface HeliaContextValue {
  helia: Helia | null;
  ready: boolean;
  error: Error | null;
  start: () => void;
}

const HeliaContext = createContext<HeliaContextValue | null>(null);

export function HeliaProvider({ children }: { children: ReactNode }) {
  const [helia, setHelia] = useState<Helia | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [requested, setRequested] = useState(false);
  const start = useCallback(() => setRequested(true), []);

  useEffect(() => {
    if (!requested) return;
    let cancelled = false;

    (async () => {
      try {
        const { getHelia } = await import("./lib/helia-init");
        const instance = await getHelia();
        if (cancelled) return;
        setHelia(instance);
        toast.success("VAULT online — Helia P2P node ready", { id: "helia-ready", duration: 3000 });
      } catch (err) {
        if (cancelled) return;
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        toast.error(`VAULT failed to start: ${e.message}`, { id: "helia-error" });
      }
    })();

    // The shared node lives for the tab, including navigation between vault consumers.
    return () => { cancelled = true; };
  }, [requested]);

  return (
    <HeliaContext.Provider value={{ helia, ready: helia !== null, error, start }}>
      {children}
    </HeliaContext.Provider>
  );
}

export function useHeliaContext() {
  const context = useContext(HeliaContext);
  const start = context?.start;
  useEffect(() => { start?.(); }, [start]);
  if (!context) throw new Error("Vault consumers must be inside HeliaProvider.");
  return context;
}
