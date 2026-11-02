import { afterEach, describe, expect, test } from "bun:test";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as dagJson from "@ipld/dag-json";

import {
  getTrustlessGateways,
  parseGatewayList,
  DEFAULT_TRUSTLESS_GATEWAYS,
} from "../src/features/ipfs/lib/gateways.ts";
import { blockMatchesCid } from "../src/features/ipfs/lib/cid-verify.ts";
import {
  fetchTrustlessBlock,
  GatewayUnreachableError,
} from "../src/features/ipfs/lib/trustless-fetch.ts";
import {
  parseCidString,
  InvalidCidError,
  resolveVaultCid,
} from "../src/features/ipfs/lib/cid-resolve.ts";
import {
  parseVaultRecord,
  SchemaInvalidError,
} from "../src/features/ipfs/schemas/vault-record.schema.ts";

const realEnv = process.env.NEXT_PUBLIC_IPFS_TRUSTLESS_GATEWAYS;

afterEach(() => {
  if (realEnv === undefined) {
    delete process.env.NEXT_PUBLIC_IPFS_TRUSTLESS_GATEWAYS;
  } else {
    process.env.NEXT_PUBLIC_IPFS_TRUSTLESS_GATEWAYS = realEnv;
  }
});

describe("trustless gateway list", () => {
  test("defaults when env is unset", () => {
    delete process.env.NEXT_PUBLIC_IPFS_TRUSTLESS_GATEWAYS;
    expect(getTrustlessGateways(undefined)).toEqual([...DEFAULT_TRUSTLESS_GATEWAYS]);
  });

  test("parses comma-separated env and strips trailing slashes", () => {
    expect(
      parseGatewayList(" https://a.example/ ,https://b.example/// "),
    ).toEqual(["https://a.example", "https://b.example"]);
    expect(
      getTrustlessGateways("https://gw.example"),
    ).toEqual(["https://gw.example"]);
  });
});

describe("CID validation", () => {
  test("rejects empty and garbage strings with InvalidCidError", async () => {
    await expect(parseCidString("")).rejects.toBeInstanceOf(InvalidCidError);
    await expect(parseCidString("not-a-cid")).rejects.toBeInstanceOf(InvalidCidError);
  });

  test("accepts a well-formed CIDv1", async () => {
    const bytes = dagJson.encode({ hello: "vault" });
    const hash = await sha256.digest(bytes);
    const cid = CID.createV1(0x0129, hash); // dag-json
    const parsed = await parseCidString(cid.toString());
    expect(parsed.toString()).toBe(cid.toString());
  });
});

describe("vault payload decoding", () => {
  test.each(["json", "unixfs"])("resolves a local %s circuit record", async (codec) => {
    const { MemoryBlockstore } = await import("blockstore-core");
    const helia = { blockstore: new MemoryBlockstore() };
    const record = {
      name: "Bell",
      description: "",
      qasm: "OPENQASM 2.0;",
      qubitCount: 2,
      gateCount: 1,
      author: "alice",
      publishedAt: "2026-10-31T00:00:00.000Z",
      tags: [],
    };
    const cid = codec === "json"
      ? await (await import("@helia/json")).json(helia).add(record)
      : await (await import("@helia/unixfs")).unixfs(helia).addBytes(
          new TextEncoder().encode(JSON.stringify(record)),
          { rawLeaves: false },
        );

    const resolved = await resolveVaultCid(cid.toString(), { helia });
    expect(resolved).toEqual({
      cid: cid.toString(),
      kind: "circuit",
      record,
      verified: true,
      source: "local",
    });
  });
});

describe("block verification", () => {
  test("matches bytes to their CID and rejects tampering", async () => {
    const bytes = dagJson.encode({ name: "ok", qasm: "OPENQASM 2.0;", qubitCount: 1, gateCount: 0, author: "t", publishedAt: "2020-01-01", description: "", tags: [] });
    const hash = await sha256.digest(bytes);
    const cid = CID.createV1(0x0129, hash);
    expect(await blockMatchesCid(bytes, cid)).toBe(true);

    const tampered = new Uint8Array(bytes);
    tampered[0] ^= 0xff;
    expect(await blockMatchesCid(tampered, cid)).toBe(false);
  });
});

describe("fetchTrustlessBlock (mocked gateways)", () => {
  test("returns verified bytes from the first healthy gateway", async () => {
    const payload = {
      name: "Shared circuit",
      description: "",
      qasm: "OPENQASM 2.0;",
      qubitCount: 2,
      gateCount: 1,
      author: "alice",
      publishedAt: "2024-01-01T00:00:00.000Z",
      tags: [],
    };
    const bytes = dagJson.encode(payload);
    const hash = await sha256.digest(bytes);
    const cid = CID.createV1(0x0129, hash);

    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));
      return new Response(bytes, {
        status: 200,
        headers: { "Content-Type": "application/vnd.ipld.raw" },
      });
    };

    const got = await fetchTrustlessBlock(cid, ["https://gw.test"], { fetchImpl });
    expect(calls[0]).toBe(`https://gw.test/ipfs/${cid.toString()}?format=raw`);
    expect(await blockMatchesCid(got, cid)).toBe(true);
  });

  test("falls through to path URL when ?format=raw body does not match CID", async () => {
    const bytes = new TextEncoder().encode("block");
    const hash = await sha256.digest(bytes);
    const cid = CID.createV1(0x55, hash);
    const calls = [];

    const fetchImpl = async (url) => {
      calls.push(String(url));
      if (String(url).includes("format=raw")) {
        return new Response(new TextEncoder().encode("wrong"), { status: 200 });
      }
      return new Response(bytes, {
        status: 200,
        headers: { "Content-Type": "application/vnd.ipld.raw" },
      });
    };

    const got = await fetchTrustlessBlock(cid, ["https://gw.test"], { fetchImpl });
    expect(calls).toHaveLength(2);
    expect(await blockMatchesCid(got, cid)).toBe(true);
  });

  test("surfaces GatewayUnreachableError when every gateway fails", async () => {
    const bytes = new TextEncoder().encode("x");
    const hash = await sha256.digest(bytes);
    const cid = CID.createV1(0x55, hash); // raw

    const fetchImpl = async () => new Response("down", { status: 502 });

    await expect(
      fetchTrustlessBlock(cid, ["https://a.test", "https://b.test"], {
        fetchImpl,
        timeoutMs: 1_000,
      }),
    ).rejects.toBeInstanceOf(GatewayUnreachableError);
  });

  test("surfaces GatewayUnreachableError when bodies never match the CID", async () => {
    const good = new TextEncoder().encode("good");
    const bad = new TextEncoder().encode("evil");
    const hash = await sha256.digest(good);
    const cid = CID.createV1(0x55, hash);

    const fetchImpl = async () =>
      new Response(bad, {
        status: 200,
        headers: { "Content-Type": "application/vnd.ipld.raw" },
      });

    await expect(
      fetchTrustlessBlock(cid, ["https://evil.test"], { fetchImpl }),
    ).rejects.toBeInstanceOf(GatewayUnreachableError);
  });
});

describe("vault record schema", () => {
  test("accepts circuit and run shapes", () => {
    const circuit = parseVaultRecord({
      name: "c",
      description: "",
      qasm: "OPENQASM 2.0;",
      qubitCount: 1,
      gateCount: 0,
      author: "a",
      publishedAt: "2024-01-01T00:00:00.000Z",
      tags: [],
    });
    expect(circuit.kind).toBe("circuit");

    const run = parseVaultRecord({
      name: "r",
      circuitCid: "bafytest",
      qubitCount: 1,
      peerCount: 2,
      runtime: 10,
      status: "completed",
      author: "a",
      publishedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(run.kind).toBe("run");
  });

  test("rejects unknown payloads with SchemaInvalidError", () => {
    expect(() => parseVaultRecord({ foo: 1 })).toThrow(SchemaInvalidError);
  });
});
