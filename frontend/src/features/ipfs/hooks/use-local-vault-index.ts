"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { getLocalItems } from "../lib/local-index";
import type { VaultItem } from "../types";

let listeners: Array<() => void> = [];

function subscribe(callback: () => void) {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

function getSnapshot(): VaultItem[] {
  return getLocalItems();
}

function emptyItems(): VaultItem[] {
  return [];
}

export function useLocalVaultIndex() {
  const items = useSyncExternalStore(subscribe, getSnapshot, emptyItems);

  const refresh = useCallback(() => {
    listeners.forEach((l) => l());
  }, []);

  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  return { items, refresh };
}
