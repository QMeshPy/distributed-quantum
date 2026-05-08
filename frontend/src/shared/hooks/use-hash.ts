"use client";

import { useCallback, useSyncExternalStore } from "react";

function getHash() {
  return typeof window !== "undefined" ? window.location.hash : "";
}

function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

export function useHash() {
  const hash = useSyncExternalStore(subscribe, getHash, () => "");

  const updateHash = useCallback((newHash: string) => {
    window.location.hash = newHash;
  }, []);

  return [hash, updateHash] as const;
}
