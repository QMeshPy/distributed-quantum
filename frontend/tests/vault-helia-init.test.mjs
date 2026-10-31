import { afterEach, expect, mock, test } from "bun:test";

const deleteDatabase = mock();
const previousIndexedDB = globalThis.indexedDB;
const originalSetTimeout = globalThis.setTimeout;
let failOpen = true;
let createCalls = 0;
const close = mock(async () => {});
mock.module("blockstore-idb", () => ({ IDBBlockstore: class {
  open() { return failOpen ? new Promise(() => {}) : Promise.resolve(); }
  close = close;
} }));
mock.module("datastore-idb", () => ({ IDBDatastore: class {
  open() { return Promise.resolve(); }
  close = close;
} }));
mock.module("helia", () => ({ createHelia: async () => { createCalls++; return { stop: async () => {} }; } }));
mock.module("@helia/block-brokers", () => ({ trustlessGateway: () => ({}) }));
mock.module("@helia/routers", () => ({ httpGatewayRouting: () => ({}) }));
const { getHelia, stopHelia } = await import("../src/features/ipfs/lib/helia-init");

afterEach(async () => {
  globalThis.setTimeout = originalSetTimeout;
  globalThis.indexedDB = previousIndexedDB;
  await stopHelia();
});

test("blocked IndexedDB preserves local vault data and explains recovery", async () => {
  globalThis.indexedDB = { deleteDatabase };
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 1);
  await expect(getHelia()).rejects.toThrow("Close other VAULT tabs");
  expect(deleteDatabase).not.toHaveBeenCalled();
  expect(createCalls).toBe(0);
});

test("a retry opens one shared node for simultaneous vault consumers", async () => {
  failOpen = false;
  const [first, second] = await Promise.all([getHelia(), getHelia()]);
  expect(first).toBe(second);
  expect(createCalls).toBe(1);
});
