import { describe, expect, test } from "bun:test";
import { dagJson } from "@helia/dag-json";
import { json } from "@helia/json";
import { CID } from "multiformats/cid";
import { MemoryBlockstore } from "blockstore-core/memory";

import {
  buildRunRecord,
  linkifyRunForDagJson,
  materializeRunRecord,
  normalizeCircuitCid,
} from "../src/features/ipfs/lib/run-record.ts";
import { resolveRunCircuit } from "../src/features/ipfs/lib/run-circuit-link.ts";
import {
  parseVaultRecord,
  SchemaInvalidError,
} from "../src/features/ipfs/schemas/vault-record.schema.ts";

/** Minimal Helia-shaped host: blockstore only (no libp2p / mDNS). */
function memoryHelia() {
  return { blockstore: new MemoryBlockstore() };
}

describe("normalizeCircuitCid", () => {
  test("keeps legacy strings", () => {
    expect(normalizeCircuitCid("  bafytest  ")).toBe("bafytest");
  });

  test("reads dag-json link form", () => {
    expect(normalizeCircuitCid({ "/": "bafylink" })).toBe("bafylink");
  });

  test("reads CID.toString()", () => {
    // Use a real CIDv1 dag-json empty-ish object hash via known fixture from multiformats docs pattern
    const cid = CID.parse(
      "bagaaierasords4njcts6vs7qvdjfcvgnume4hqohf65zsfguprqphs3icwea",
    );
    expect(normalizeCircuitCid(cid)).toBe(cid.toString());
  });
});

describe("run record builders", () => {
  test("buildRunRecord requires name and circuitCid", () => {
    expect(() => buildRunRecord({ name: "", circuitCid: "x" })).toThrow();
    expect(() => buildRunRecord({ name: "r", circuitCid: "" })).toThrow();
  });

  test("materializeRunRecord accepts string circuitCid", () => {
    const run = materializeRunRecord({
      name: "r",
      circuitCid: "bafylegacy",
      qubitCount: 2,
      peerCount: 1,
      runtime: 5,
      status: "completed",
      author: "a",
      publishedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(run.circuitCid).toBe("bafylegacy");
  });
});

describe("vault schema accepts linked and legacy circuitCid", () => {
  test("legacy string still parses", () => {
    const { kind, record } = parseVaultRecord({
      name: "r",
      circuitCid: "bafytest",
      qubitCount: 1,
      peerCount: 2,
      runtime: 10,
      status: "completed",
      author: "a",
      publishedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(kind).toBe("run");
    expect(record.circuitCid).toBe("bafytest");
  });

  test("link object form parses", () => {
    const { kind, record } = parseVaultRecord({
      name: "r",
      circuitCid: { "/": "bafylinked" },
      qubitCount: 1,
      peerCount: 2,
      runtime: 10,
      status: "completed",
      author: "a",
      publishedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(kind).toBe("run");
    expect(record.circuitCid).toBe("bafylinked");
  });

  test("rejects junk", () => {
    expect(() => parseVaultRecord({ foo: 1 })).toThrow(SchemaInvalidError);
  });
});

describe("round-trip: encode run with dag-json link and traverse to circuit", () => {
  test("root run CID resolves linked circuit", async () => {
    const helia = memoryHelia();
    const j = json(helia);
    const dj = dagJson(helia);

    const circuitPayload = {
      name: "Bell",
      description: "",
      qasm: "OPENQASM 2.0;\nqreg q[2];\nh q[0];\ncx q[0],q[1];",
      qubitCount: 2,
      gateCount: 2,
      author: "tester",
      publishedAt: "2024-01-01T00:00:00.000Z",
      tags: ["bell"],
    };
    const circuitCid = await j.add(circuitPayload);

    const runPlain = buildRunRecord({
      name: "demo-run",
      circuitCid: circuitCid.toString(),
      qubitCount: 2,
      peerCount: 3,
      runtime: 42,
      status: "completed",
      author: "tester",
      publishedAt: "2024-01-01T00:00:00.000Z",
    });
    const linked = await linkifyRunForDagJson(runPlain);
    expect(CID.asCID(linked.circuitCid)).toBeTruthy();

    const runCid = await dj.add(linked);

    const resolved = await resolveRunCircuit(helia, runCid.toString());
    expect(resolved.run.name).toBe("demo-run");
    expect(resolved.circuitCid).toBe(circuitCid.toString());
    expect(resolved.circuit.name).toBe("Bell");
    expect(resolved.circuit.qasm).toContain("OPENQASM");
  });

  test("legacy string-valued run still opens via materialize", async () => {
    const helia = memoryHelia();
    const j = json(helia);
    const circuitCid = await j.add({
      name: "legacy-c",
      description: "",
      qasm: "OPENQASM 2.0;\nqreg q[1];",
      qubitCount: 1,
      gateCount: 0,
      author: "a",
      publishedAt: "2024-01-01T00:00:00.000Z",
      tags: [],
    });

    // Old path: plain @helia/json with string circuitCid
    const runCid = await j.add({
      name: "legacy-run",
      circuitCid: circuitCid.toString(),
      qubitCount: 1,
      peerCount: 1,
      runtime: 1,
      status: "completed",
      author: "a",
      publishedAt: "2024-01-01T00:00:00.000Z",
    });

    const resolved = await resolveRunCircuit(helia, runCid.toString());
    expect(resolved.run.name).toBe("legacy-run");
    expect(resolved.circuit.name).toBe("legacy-c");
  });
});
