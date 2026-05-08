import type { VaultItem, LocalVaultIndex } from "../types";

const STORAGE_KEY = "vault:cid_index";

function getIndex(): LocalVaultIndex {
  if (typeof window === "undefined") return { items: [], lastUpdated: "" };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { items: [], lastUpdated: "" };
  try {
    return JSON.parse(raw) as LocalVaultIndex;
  } catch {
    return { items: [], lastUpdated: "" };
  }
}

function saveIndex(index: LocalVaultIndex): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(index));
}

export function addToIndex(item: Omit<VaultItem, "addedAt">): void {
  const index = getIndex();
  const exists = index.items.some((i) => i.cid === item.cid);
  if (exists) return;

  index.items.unshift({ ...item, addedAt: new Date().toISOString() });
  index.lastUpdated = new Date().toISOString();
  saveIndex(index);
}

export function removeFromIndex(cid: string): void {
  const index = getIndex();
  index.items = index.items.filter((i) => i.cid !== cid);
  index.lastUpdated = new Date().toISOString();
  saveIndex(index);
}

export function getLocalItems(): VaultItem[] {
  return getIndex().items;
}

export function getItemByCid(cid: string): VaultItem | undefined {
  return getIndex().items.find((i) => i.cid === cid);
}
