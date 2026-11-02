import { z } from "zod";
import { normalizeCircuitCid } from "../lib/run-record";

export const circuitIpfsRecordSchema = z.object({
  cid: z.string().optional(),
  name: z.string(),
  description: z.string().default(""),
  qasm: z.string(),
  qubitCount: z.number(),
  gateCount: z.number(),
  author: z.string(),
  publishedAt: z.string(),
  tags: z.array(z.string()).default([]),
});

/** Accepts legacy string CIDs and dag-json CID / `{"/":"..."}` links. */
const circuitCidSchema = z.preprocess(
  (value) => normalizeCircuitCid(value as Parameters<typeof normalizeCircuitCid>[0]),
  z.string().min(1),
);

export const runIpfsRecordSchema = z.object({
  cid: z.string().optional(),
  name: z.string(),
  circuitCid: circuitCidSchema,
  qubitCount: z.number(),
  peerCount: z.number(),
  runtime: z.number(),
  status: z.string(),
  author: z.string(),
  publishedAt: z.string(),
  results: z.record(z.string(), z.unknown()).optional(),
});

export const vaultRecordSchema = z.union([
  circuitIpfsRecordSchema,
  runIpfsRecordSchema,
]);

export type CircuitIpfsRecord = z.infer<typeof circuitIpfsRecordSchema>;
export type RunIpfsRecord = z.infer<typeof runIpfsRecordSchema>;
export type VaultRecord = z.infer<typeof vaultRecordSchema>;

export type VaultRecordKind = "circuit" | "run";

export function classifyVaultRecord(record: VaultRecord): VaultRecordKind {
  if ("qasm" in record && typeof record.qasm === "string") return "circuit";
  return "run";
}

export function parseVaultRecord(data: unknown): {
  kind: VaultRecordKind;
  record: VaultRecord;
} {
  const circuit = circuitIpfsRecordSchema.safeParse(data);
  if (circuit.success) {
    return { kind: "circuit", record: circuit.data };
  }
  const run = runIpfsRecordSchema.safeParse(data);
  if (run.success) {
    return { kind: "run", record: run.data };
  }
  const message = [
    circuit.error.issues[0]?.message,
    run.error.issues[0]?.message,
  ]
    .filter(Boolean)
    .join("; ");
  throw new SchemaInvalidError(
    message || "Decoded block is not a vault circuit or run record",
  );
}

export class SchemaInvalidError extends Error {
  readonly code = "SCHEMA_INVALID" as const;
  constructor(message: string) {
    super(message);
    this.name = "SchemaInvalidError";
  }
}
