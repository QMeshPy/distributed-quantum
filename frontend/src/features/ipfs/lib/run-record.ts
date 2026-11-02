import type { CID } from "multiformats/cid";
import type { RunIPFSRecord } from "../types";

/**
 * Vault run records use `circuitCid` as an IPLD link (dag-json CID) so one root
 * CID covers the run and its circuit. The string form of that CID matches what
 * provenance bundles store under `storage[].cid` (StorageReference / #4).
 */

export type CircuitCidInput = string | CID | { "/": string } | null | undefined;

/** Normalize legacy strings, dag-json CID instances, and `{"/":"..."}` link forms. */
export function normalizeCircuitCid(value: CircuitCidInput): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    if ("/" in value && typeof (value as { "/": unknown })["/"] === "string") {
      return (value as { "/": string })["/"].trim();
    }
    if (
      "toString" in value &&
      typeof (value as { toString: () => string }).toString === "function"
    ) {
      const s = (value as { toString: () => string }).toString();
      if (s && s !== "[object Object]") return s;
    }
  }
  return "";
}

export type BuildRunRecordInput = {
  name: string;
  circuitCid: string;
  qubitCount?: number;
  peerCount?: number;
  runtime?: number;
  status?: string;
  author?: string;
  publishedAt?: string;
  results?: Record<string, unknown>;
};

/** Plain (UI / legacy) run record — circuitCid is always a string. */
export function buildRunRecord(input: BuildRunRecordInput): RunIPFSRecord {
  const name = input.name.trim();
  const circuitCid = normalizeCircuitCid(input.circuitCid);
  if (!name) throw new Error("Run name is required");
  if (!circuitCid) throw new Error("circuitCid is required");

  return {
    cid: "",
    name,
    circuitCid,
    qubitCount: input.qubitCount ?? 0,
    peerCount: input.peerCount ?? 0,
    runtime: input.runtime ?? 0,
    status: input.status ?? "completed",
    author: (input.author ?? "anonymous").trim() || "anonymous",
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    ...(input.results ? { results: input.results } : {}),
  };
}

/**
 * Prepare a run object for `@helia/dag-json` where `circuitCid` is a real CID
 * link (not a plain string).
 */
export async function linkifyRunForDagJson(
  record: Omit<RunIPFSRecord, "cid"> | RunIPFSRecord,
): Promise<Record<string, unknown>> {
  const circuitCidStr = normalizeCircuitCid(record.circuitCid);
  if (!circuitCidStr) {
    throw new Error("circuitCid is required to link a run to its circuit");
  }
  const { CID } = await import("multiformats/cid");
  const circuitCid = CID.parse(circuitCidStr);

  const { cid: _omit, ...rest } = record as RunIPFSRecord;
  void _omit;
  return {
    ...rest,
    circuitCid,
  };
}

/** After dag-json decode, coerce linked `circuitCid` back to a string for UI/schema. */
export function materializeRunRecord(raw: unknown): RunIPFSRecord {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid run record");
  }
  const obj = raw as Record<string, unknown>;
  const circuitCid = normalizeCircuitCid(obj.circuitCid as CircuitCidInput);
  return buildRunRecord({
    name: String(obj.name ?? ""),
    circuitCid,
    qubitCount: Number(obj.qubitCount ?? 0),
    peerCount: Number(obj.peerCount ?? 0),
    runtime: Number(obj.runtime ?? 0),
    status: String(obj.status ?? "completed"),
    author: String(obj.author ?? "anonymous"),
    publishedAt: String(obj.publishedAt ?? new Date().toISOString()),
    results:
      obj.results && typeof obj.results === "object"
        ? (obj.results as Record<string, unknown>)
        : undefined,
  });
}
