import type { PinningService } from "../types";

const STORAGE_KEY = "vault:pin_queue";

interface QueuedAction {
  cid: string;
  service: PinningService;
  action: "pin" | "unpin";
  size: number;
  type: "circuit" | "run";
  metadata: Record<string, unknown>;
  timestamp: string;
}

interface PinQueue {
  pending: QueuedAction[];
}

function getQueue(): PinQueue {
  if (typeof window === "undefined") return { pending: [] };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { pending: [] };
  try {
    return JSON.parse(raw) as PinQueue;
  } catch {
    return { pending: [] };
  }
}

function saveQueue(queue: PinQueue): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function enqueue(action: Omit<QueuedAction, "timestamp">): void {
  const queue = getQueue();
  queue.pending.push({ ...action, timestamp: new Date().toISOString() });
  saveQueue(queue);
}

export function dequeue(): QueuedAction | undefined {
  const queue = getQueue();
  const item = queue.pending.shift();
  saveQueue(queue);
  return item;
}

export function peekAll(): QueuedAction[] {
  return getQueue().pending;
}

export function clear(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function queueLength(): number {
  return getQueue().pending.length;
}
