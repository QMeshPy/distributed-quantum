import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
const { getProvider } = await import("../src/features/vault-pinning/server/providers.ts");
const cid = "bafkreigh2akiscaildcx2bxz53f5o5eo7neupnbq5zdsvhbed4w5qpvlhi";

const realFetch = globalThis.fetch;

let calls;

function fakeFetch(response) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return response;
  };
}

beforeEach(() => {
  process.env.LIGHTHOUSE_API_KEY = "test-key";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const key of ["LIGHTHOUSE_API_KEY", "PINATA_JWT", "PINATA_API_KEY", "PINATA_API_SECRET"]) delete process.env[key];
});

describe("lighthouse pinning provider (shown as Filecoin)", () => {
  test("is registered next to Pinata and shown as Filecoin", () => {
    expect(getProvider("lighthouse").displayName).toBe("Filecoin (via Lighthouse)");
    expect(getProvider("pinata").displayName).toBe("Pinata");
  });

  test("uploads to Lighthouse with the API key and returns the CID and size", async () => {
    fakeFetch(
      Response.json({ Name: "vault.json", Hash: cid, Size: "58" }),
    );

    const result = await getProvider("lighthouse").pin("bagaTestCid", { a: 1 });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://upload.lighthouse.storage/api/v0/add");
    expect(calls[0].init.headers.Authorization).toBe("Bearer test-key");
    expect(result.cid).toBe(cid);
    expect(result.size).toBe(58);
  });

  test("surfaces the upload error instead of reporting a pin", async () => {
    fakeFetch(new Response("quota exceeded", { status: 402 }));

    await expect(getProvider("lighthouse").pin("bagaTestCid", {})).rejects.toThrow(
      "Lighthouse upload failed (402)",
    );
  });

  test("fails with a clear message when the API key is missing", async () => {
    delete process.env.LIGHTHOUSE_API_KEY;
    fakeFetch(Response.json({}));

    await expect(getProvider("lighthouse").pin("bagaTestCid", {})).rejects.toThrow(
      "LIGHTHOUSE_API_KEY",
    );
    expect(calls).toHaveLength(0);
  });
});

test("legacy nft.storage service uses the identical Pinata implementation", () => {
  expect(getProvider("nft.storage")).toBe(getProvider("pinata"));
});

test("Pinata supports server JWT and key pair authentication", async () => {
  fakeFetch(Response.json({ IpfsHash: cid, PinSize: 10 }));
  process.env.PINATA_API_KEY = "test-api-key";
  process.env.PINATA_API_SECRET = "test-api-secret";
  await getProvider("pinata").pin(cid, { name: "Circuit" });
  expect(calls[0].init.headers.pinata_api_key).toBe("test-api-key");
  expect(calls[0].init.headers.pinata_secret_api_key).toBe("test-api-secret");
  fakeFetch(Response.json({ IpfsHash: cid, PinSize: 10 }));
  process.env.PINATA_JWT = "test-jwt";
  await getProvider("pinata").pin(cid, { name: "Circuit" });
  expect(calls[0].init.headers.Authorization).toBe("Bearer test-jwt");
  expect(calls[0].init.headers.pinata_secret_api_key).toBeUndefined();
  expect(calls[0].init.redirect).toBe("error");
});

test("missing server credentials never contact Pinata", async () => {
  fakeFetch(Response.json({}));
  await expect(getProvider("pinata").pin(cid, {})).rejects.toThrow("PINATA_JWT");
  expect(calls).toHaveLength(0);
});

test("malformed provider success cannot be recorded as a successful pin", async () => {
  fakeFetch(Response.json({ IpfsHash: "invalid-cid", PinSize: -1 }));
  process.env.PINATA_JWT = "test-jwt";
  await expect(getProvider("pinata").pin(cid, {})).rejects.toThrow("invalid pin result");
  fakeFetch(Response.json({ IpfsHash: cid, PinSize: null }));
  await expect(getProvider("pinata").pin(cid, {})).rejects.toThrow("invalid pin result");
});
