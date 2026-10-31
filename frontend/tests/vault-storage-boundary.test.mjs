import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

let user;
let records;
let calls;
const cid = "bafkreigh2akiscaildcx2bxz53f5o5eo7neupnbq5zdsvhbed4w5qpvlhi";
const gatewayCid = "QmYwAPJzv5CZsnAzt8auVZRnGi2C6YtbPLbq2e3ATW9Xc1";
const realFetch = globalThis.fetch;
mock.module("server-only", () => ({}));
mock.module("../src/features/auth/server/session", () => ({ getSession: async () => ({ user }) }));
const matches = (record, filter) => Object.entries(filter).every(([key, value]) => {
  if (key === "$or") return value.some((branch) => matches(record, branch));
  if (value && typeof value === "object") {
    if ("$ne" in value) return record[key] !== value.$ne;
    if ("$in" in value) return value.$in.includes(record[key]);
  }
  return record[key] === value;
});
const collection = {
  findOne: async (filter) => [...records].reverse().find((record) => matches(record, filter)) ?? null,
  insertOne: async (record) => { records.push(record); return { insertedId: "saved" }; },
  updateOne: async (filter, update) => {
    const record = records.find((record) => matches(record, filter));
    if (record) Object.assign(record, update.$set);
    return { matchedCount: record ? 1 : 0 };
  },
};
mock.module("../src/shared/lib/mongodb", () => ({ getDatabase: async () => ({ collection: () => collection }) }));
const { POST } = await import("../src/app/api/vault/pin/route");
const { PATCH } = await import("../src/app/api/vault/pin/[cid]/route");

function request(body, headers = {}) {
  return new Request("https://app.test/api/vault/pin", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://app.test", ...headers },
    body: JSON.stringify(body),
  });
}
const pin = () => ({ cid, service: "pinata", action: "pin", type: "circuit", metadata: { name: "Bell circuit" } });
const unpin = () => ({ cid, service: "pinata", action: "unpin", hardDelete: false });

beforeEach(() => {
  user = { id: "owner" };
  records = [];
  calls = [];
  process.env.PINATA_JWT = "server-test-token";
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ IpfsHash: gatewayCid, PinSize: 42 });
  };
});
afterEach(() => { globalThis.fetch = realFetch; delete process.env.PINATA_JWT; });

test("anonymous uploads and deletes never reach storage or audit", async () => {
  user = null;
  expect((await POST(request(pin()))).status).toBe(401);
  expect((await POST(request(unpin()))).status).toBe(401);
  expect(calls).toHaveLength(0);
  expect(records).toHaveLength(0);
});

test("upload uses server credentials and records session ownership and exact provider CID", async () => {
  const response = await POST(request(pin()));
  expect(response.status).toBe(200);
  expect((await response.json()).gatewayCid).toBe(gatewayCid);
  expect(calls).toHaveLength(1);
  expect(calls[0].init.headers.Authorization).toBe("Bearer server-test-token");
  expect(records[0]).toMatchObject({ userId: "owner", cid, gatewayCid, service: "pinata", size: 42, metadata: pin().metadata });
});

test("invalid shape, forged ownership, and cross-origin requests cannot pin", async () => {
  for (const invalid of [
    { ...pin(), cid: { $ne: null } },
    { ...pin(), cid: "invalid-cid" },
    { ...pin(), service: "https://attacker.test" },
    { ...pin(), action: "migrate" },
    { ...pin(), metadata: [] },
    { ...pin(), userId: "victim" },
    { ...pin(), gatewayCid },
  ]) expect((await POST(request(invalid))).status).toBe(400);
  expect((await POST(request(pin(), { Origin: "https://attacker.test" }))).status).toBe(403);
  expect(calls).toHaveLength(0);
});

test("oversized bodies are rejected even without content-length", async () => {
  expect((await POST(request({ ...pin(), metadata: { name: "x".repeat(1_048_577) } }))).status).toBe(413);
  expect(calls).toHaveLength(0);
});

test("malformed JSON and wrong content types fail before any provider call", async () => {
  expect((await POST(new Request("https://app.test/api/vault/pin", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{broken",
  }))).status).toBe(400);
  expect((await POST(request(pin(), { "Content-Type": "text/plain" }))).status).toBe(415);
  expect(calls).toHaveLength(0);
});

test("provider errors do not create successful audit records or leak response bodies", async () => {
  globalThis.fetch = async () => new Response("private-provider-diagnostic", { status: 403 });
  const response = await POST(request(pin()));
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("private-provider-diagnostic");
  expect(records).toHaveLength(0);
});

test("unpin requires the current user's pin record", async () => {
  records.push({ userId: "victim", cid, gatewayCid, service: "pinata", action: "pin" });
  expect((await POST(request(unpin()))).status).toBe(404);
  expect(calls).toHaveLength(0);
  expect(records).toHaveLength(1);
});

test("tracking removal preserves the owner's metadata without deleting provider content", async () => {
  records.push({ userId: "owner", cid, gatewayCid, service: "pinata", action: "pin", type: "run", metadata: { name: "My run" } });
  expect((await POST(request(unpin()))).status).toBe(200);
  expect(calls).toHaveLength(0);
  expect(records[1]).toMatchObject({ userId: "owner", type: "run", metadata: { name: "My run" }, action: "unpin" });
});

for (const service of ["pinata", "nft.storage", "lighthouse"]) {
  test(`${service} permanent deletion is always refused without provider calls or audit changes`, async () => {
    records.push({ userId: "owner", cid, gatewayCid, service, action: "pin", type: "run", metadata: { name: "My run" } });
    const before = structuredClone(records);
    const response = await POST(request({ ...unpin(), service, hardDelete: true }));
    expect(response.status).toBe(409);
    expect(await response.text()).toContain("provider dashboard");
    expect(calls).toHaveLength(0);
    expect(records).toEqual(before);
  });
}

test("legacy pins can be removed from tracking without a provider CID", async () => {
  records.push({ userId: "owner", cid, service: "pinata", action: "pin", type: "circuit", metadata: { name: "Legacy circuit" } });
  expect((await POST(request(unpin()))).status).toBe(200);
  expect(records[1]).toMatchObject({ userId: "owner", action: "unpin", metadata: { name: "Legacy circuit" } });
  expect(calls).toHaveLength(0);
});

test("metadata updates validate types and preserve ownership and provider identifiers", async () => {
  records.push({ _id: "victim-pin", userId: "victim", cid, gatewayCid, service: "pinata", action: "pin" });
  const context = { params: Promise.resolve({ cid }) };
  expect((await PATCH(request({ service: "pinata", size: 20 }), context)).status).toBe(404);
  user = null;
  expect((await PATCH(request({ service: "pinata", size: 20 }), context)).status).toBe(401);
  user = { id: "victim" };
  for (const invalid of [{ service: { $ne: "" }, size: 20 }, { service: "pinata", size: -1 }, { service: "pinata", gatewayCid: cid }]) {
    expect((await PATCH(request(invalid), context)).status).toBe(400);
  }
  expect((await PATCH(request({ service: "pinata", syncStatus: "synced" }), context)).status).toBe(200);
  expect(records[0]).toMatchObject({ userId: "victim", gatewayCid, syncStatus: "synced" });
  expect(calls).toHaveLength(0);
});

test("client entry points contain no provider credentials or server provider imports", () => {
  const root = new URL("../src/features/vault-pinning/", import.meta.url);
  for (const path of readdirSync(root, { recursive: true }).filter((path) => /\.tsx?$/.test(path) && !path.startsWith("server/"))) {
    const source = readFileSync(new URL(`../src/features/vault-pinning/${path}`, import.meta.url), "utf8");
    expect(source).not.toMatch(/NEXT_PUBLIC_(PINATA|LIGHTHOUSE)|process\.env|[\"']\.\.\/server|api\.pinata\.cloud|upload\.lighthouse\.storage/);
  }
});
