import { describe, expect, test } from "bun:test";
import {
  anchorLabel,
  parseReceipt,
  proofLabel,
  formatToken,
  pendingKey,
  readPending,
} from "../src/features/filecoin/model.ts";
import { proxyFilecoin } from "../src/features/filecoin/server/proxy.ts";

const receipt = {
  network: "calibration",
  chain_id: 314159,
  piece_cid: "bafkzcibfixture",
  sha256: "a".repeat(64),
  size_bytes: 256,
  complete: true,
  copies: [],
  transaction_hashes: [],
};

describe("Filecoin evidence", () => {
  test("rejects mainnet and malformed evidence instead of displaying verified", () => {
    expect(parseReceipt(receipt)).toEqual(receipt);
    expect(() => parseReceipt({ ...receipt, chain_id: 314 })).toThrow();
    expect(() => parseReceipt({ ...receipt, sha256: "tampered" })).toThrow();
  });
  test("pending or unregistered possession never displays as proven", () => {
    expect(
      proofLabel({
        registered: true,
        live: true,
        proof_status: "proven_this_period",
      }),
    ).toBe("Proven this period");
    expect(
      proofLabel({
        registered: true,
        live: true,
        proof_status: "pending_this_period",
      }),
    ).toBe("Awaiting this period’s proof");
    expect(
      proofLabel({
        registered: false,
        live: true,
        proof_status: "proven_this_period",
      }),
    ).toBe("Piece not registered");
  });
  test("formats token units without precision loss and scopes pending writes to the account", () => {
    expect(formatToken("1000000000000000000")).toBe("1");
    expect(formatToken("1234560000000000000")).toBe("1.23456");
    expect(formatToken(undefined)).toBe("—");
    expect(pendingKey("alice")).not.toBe(pendingKey("bob"));
  });
  test("restores an uncertain operation after reload without replacing its ID", () => {
    const pending = {
      operation_id: "persisted-id",
      agent_id: "a",
      label: "Deposit",
      started_at: "2026-11-11T00:00:00Z",
    };
    const storage = {
      getItem: (key) =>
        key === pendingKey("alice") ? JSON.stringify(pending) : null,
    };
    expect(readPending(storage, "alice")).toEqual(pending);
    expect(readPending(storage, "bob")).toBeNull();
    expect(() =>
      readPending({ getItem: () => '{"operation_id":"lost"}' }, "alice"),
    ).toThrow();
  });
  test("an intact package with an unavailable anchor does not claim NEAR verification", () => {
    expect(
      anchorLabel({
        status: "partially_verified",
        checks: [
          {
            kind: "hash",
            name: "content",
            status: "passed",
            message: "Intact",
          },
          {
            kind: "anchor",
            name: "near",
            status: "unavailable",
            message: "RPC unavailable",
          },
        ],
      }),
    ).toBe("Anchor verification unavailable");
  });
});

describe("authenticated Filecoin proxy", () => {
  test("rejects path traversal and unlisted operations without forwarding", async () => {
    let calls = 0;
    const send = async () => {
      calls++;
      return Response.json({});
    };
    expect(
      (
        await proxyFilecoin(
          new Request("https://app.test/api/filecoin/accounts"),
          ["..", "wallet"],
          send,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await proxyFilecoin(
          new Request("https://app.test/api/filecoin/accounts"),
          ["payments"],
          send,
        )
      ).status,
    ).toBe(404);
    expect(calls).toBe(0);
  });
  test("rejects cross-origin writes and forwards the exact same operation ID", async () => {
    const body = {
      operation_id: "stable-id",
      agent_id: "a",
      action: "deposit",
      amount_usdfc: "1",
    };
    let calls = 0;
    const send = async (url, init) => {
      calls++;
      expect(JSON.parse(init.body)).toEqual(body);
      return Response.json({ transaction_hash: "tx" });
    };
    const request = (origin) =>
      new Request("https://app.test/api/filecoin/payments", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    expect(
      (await proxyFilecoin(request("https://evil.test"), ["payments"], send))
        .status,
    ).toBe(403);
    expect(
      (await proxyFilecoin(request("https://app.test"), ["payments"], send))
        .status,
    ).toBe(200);
    expect(calls).toBe(1);
  });
  test("preserves auth failures and binary retrieval", async () => {
    const request = new Request("https://app.test/api/filecoin/retrieve", {
      method: "POST",
      headers: {
        Origin: "https://app.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(receipt),
    });
    const binary = await proxyFilecoin(
      request,
      ["retrieve"],
      async () =>
        new Response(new Uint8Array([0, 255, 42]), {
          headers: { "Content-Type": "application/octet-stream" },
        }),
    );
    expect([...new Uint8Array(await binary.arrayBuffer())]).toEqual([
      0, 255, 42,
    ]);
    const denied = await proxyFilecoin(
      new Request("https://app.test/api/filecoin/accounts"),
      ["accounts"],
      async () => Response.json({ error: "Sign in" }, { status: 401 }),
    );
    expect(denied.status).toBe(401);
  });
});
