import type { Helia } from "helia";
import type { CircuitIPFSRecord, RunIPFSRecord } from "../types";
import { materializeRunRecord, normalizeCircuitCid } from "./run-record";

/**
 * Load a vault run (dag-json or legacy JSON) and follow `circuitCid` to the
 * circuit record. Works for both IPLD links and legacy string CIDs.
 */
export async function resolveRunCircuit(
  helia: Helia,
  runCidStr: string,
): Promise<{ run: RunIPFSRecord; circuit: CircuitIPFSRecord; circuitCid: string }> {
  const { CID } = await import("multiformats/cid");
  const runCid = CID.parse(runCidStr.trim());

  const rawRun = await getVaultJson(helia, runCid);
  const run = materializeRunRecord(rawRun);
  const circuitCid = normalizeCircuitCid(run.circuitCid);
  if (!circuitCid) {
    throw new Error("Run record has no circuitCid link");
  }

  const circuitRaw = await getVaultJson(helia, CID.parse(circuitCid));
  const circuit = circuitRaw as CircuitIPFSRecord;

  return { run, circuit, circuitCid };
}

/** Try dag-json first (linked runs), then @helia/json (legacy / circuits). */
export async function getVaultJson(
  helia: Helia,
  cid: import("multiformats/cid").CID,
): Promise<unknown> {
  try {
    const { dagJson } = await import("@helia/dag-json");
    // Helia vs @helia/dag-json pull divergent multiformats/blockstore types.
    return await dagJson(helia as never).get(cid as never);
  } catch {
    // not dag-json
  }

  try {
    const { json } = await import("@helia/json");
    return await json(helia).get(cid);
  } catch {
    // not helia json
  }

  throw new Error(`Unable to decode vault block ${cid.toString()}`);
}
