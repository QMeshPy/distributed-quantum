import type { Helia } from "helia";

let heliaInstance: Helia | null = null;
let initPromise: Promise<Helia> | null = null;

export async function getHelia(): Promise<Helia> {
  if (heliaInstance) return heliaInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const { createHelia } = await import("helia");
    const { OPFSBlockstore } = await import("blockstore-opfs");
    const { MemoryDatastore } = await import("datastore-core/memory");

    const blockstore = new OPFSBlockstore("vault/blockstore");
    const datastore = new MemoryDatastore();

    const helia = await createHelia({ blockstore, datastore });
    heliaInstance = helia;
    return helia;
  })();

  return initPromise;
}

export async function stopHelia(): Promise<void> {
  if (heliaInstance) {
    await heliaInstance.stop();
    heliaInstance = null;
    initPromise = null;
  }
}
