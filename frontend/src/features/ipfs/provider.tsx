"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Helia } from "helia";

interface HeliaContextValue {
  helia: Helia | null;
  ready: boolean;
  error: Error | null;
}

const HeliaContext = createContext<HeliaContextValue>({
  helia: null,
  ready: false,
  error: null,
});

export function HeliaProvider({ children }: { children: ReactNode }) {
  const [helia, setHelia] = useState<Helia | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      try {
        const { getHelia } = await import("./lib/helia-init");
        const instance = await getHelia();
        setHelia(instance);
        setReady(true);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return () => {
      import("./lib/helia-init").then(({ stopHelia }) => stopHelia());
    };
  }, []);

  return (
    <HeliaContext.Provider value={{ helia, ready, error }}>
      {children}
    </HeliaContext.Provider>
  );
}

export function useHeliaContext() {
  return useContext(HeliaContext);
}
