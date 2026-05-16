import type { Helia } from "helia";

let heliaInstance: Helia | null = null;
let initPromise: Promise<Helia> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Helia init timed out at: ${label} (${ms}ms)`)), ms),
    ),
  ]);
}

export async function getHelia(): Promise<Helia> {
  if (heliaInstance) return heliaInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    console.log("[helia-init] starting…");

    const { createHelia } = await import("helia");
    const { IDBBlockstore } = await import("blockstore-idb");
    const { IDBDatastore } = await import("datastore-idb");

    console.log("[helia-init] modules loaded, opening IDB stores…");

    const blockstore = new IDBBlockstore("vault/blockstore");
    const datastore = new IDBDatastore("vault/datastore");

    // IDB open can hang indefinitely if a previous tab left a version-change
    // transaction open. Timeout at 8 s and surface a clear error.
    await withTimeout(blockstore.open(), 8_000, "blockstore.open()").catch(async (err) => {
      console.error("[helia-init] blockstore.open() failed:", err);
      // Attempt to delete the corrupted store so next reload recovers.
      try { indexedDB.deleteDatabase("vault/blockstore"); } catch {}
      throw err;
    });
    console.log("[helia-init] blockstore open ✓");

    await withTimeout(datastore.open(), 8_000, "datastore.open()").catch(async (err) => {
      console.error("[helia-init] datastore.open() failed:", err);
      try { indexedDB.deleteDatabase("vault/datastore"); } catch {}
      throw err;
    });
    console.log("[helia-init] datastore open ✓");

    console.log("[helia-init] creating Helia…");
    // No explicit libp2p instance — Helia 6.x creates its own minimal internal
    // node. This avoids the 'libp2p' package dependency and is sufficient for
    // local CID generation and IDB storage without dialing external peers.
    const helia = await withTimeout(
      createHelia({ blockstore, datastore }),
      10_000,
      "createHelia()",
    );
    console.log("[helia-init] Helia ready ✓");

    heliaInstance = helia;
    return helia;
  })().catch((err) => {
    // Reset so a page reload can retry rather than getting stuck on the same
    // rejected promise forever.
    console.error("[helia-init] FAILED:", err);
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
