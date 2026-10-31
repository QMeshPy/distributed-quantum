import type { Helia } from "helia";
import { getTrustlessGateways } from "./gateways";

let heliaInstance: Helia | null = null;
let initPromise: Promise<Helia> | null = null;

async function withTimeout<T>(
  promise: Promise<T>, ms: number, label: string, closeLate: (value: T) => Promise<void>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    return await Promise.race([
      promise.then(async (value) => {
        if (timedOut) await closeLate(value);
        return value;
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error(`Helia startup timed out at ${label}. Close other VAULT tabs and reload. Your local vault data has been preserved.`));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function getHelia(): Promise<Helia> {
  if (heliaInstance) return heliaInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const { createHelia } = await import("helia");
    const { IDBBlockstore } = await import("blockstore-idb");
    const { IDBDatastore } = await import("datastore-idb");
    const { trustlessGateway } = await import("@helia/block-brokers");
    const { httpGatewayRouting } = await import("@helia/routers");

    const blockstore = new IDBBlockstore("vault/blockstore");
    const datastore = new IDBDatastore("vault/datastore");

    try {
      await withTimeout(blockstore.open(), 8_000, "blockstore.open()", () => blockstore.close());
      await withTimeout(datastore.open(), 8_000, "datastore.open()", () => datastore.close());

      const gateways = getTrustlessGateways();
      // Verified gateway blocks are cached locally; gateways see the requested CID.
      const helia = await withTimeout(
        createHelia({
          blockstore,
          datastore,
          blockBrokers: [trustlessGateway()],
          routers: [httpGatewayRouting({ gateways, shuffle: false })],
        }),
        10_000,
        "createHelia()",
        (instance) => instance.stop(),
      );

      heliaInstance = helia;
      return helia;
    } catch (error) {
      await Promise.allSettled([blockstore.close(), datastore.close()]);
      throw error;
    }
  })().catch((err) => {
    // Reset so a page reload can retry rather than getting stuck on the same
    // rejected promise forever.
    initPromise = null;
    throw err;
  });

  return initPromise;
}

export async function stopHelia(): Promise<void> {
  if (heliaInstance) {
    await heliaInstance.stop();
    heliaInstance = null;
    initPromise = null;
  }
}
