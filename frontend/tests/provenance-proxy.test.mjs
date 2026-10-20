import { afterEach, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
const { GET } = await import("../src/app/api/provenance/[bundleId]/verify/route");
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("BFF forwards authorization and backend status without forwarding browser cookies", async () => {
  let upstreamUrl = "";
  let upstreamOptions;
  globalThis.fetch = mock(async (input, options) => {
    upstreamUrl = String(input);
    upstreamOptions = options;
    return Response.json({ detail: "not found" }, { status: 404 });
  });
  const response = await GET(new Request("http://localhost/api/provenance/bundle-1/verify", {
    headers: { Authorization: "Bearer fixture-token", Cookie: "fixture-cookie=value" },
  }), { params: Promise.resolve({ bundleId: "bundle-1" }) });
  expect(upstreamUrl).toEndWith("/api/v1/provenance/bundle-1/verify");
  expect(upstreamOptions?.headers).toEqual({ Authorization: "Bearer fixture-token" });
  expect(upstreamOptions?.cache).toBe("no-store");
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

test("BFF does not invent credentials for unauthenticated requests", async () => {
  let upstreamHeaders;
  globalThis.fetch = mock(async (_input, options) => {
    upstreamHeaders = options?.headers;
    return Response.json({ detail: "unauthorized" }, { status: 401 });
  });
  const response = await GET(new Request("http://localhost/api/provenance/bundle-1/verify"), {
    params: Promise.resolve({ bundleId: "bundle-1" }),
  });
  expect(upstreamHeaders).toEqual({});
  expect(response.status).toBe(401);
});

test("BFF returns 502 on network failure, not a fabricated verified result", async () => {
  globalThis.fetch = mock(async () => { throw new Error("unreachable"); });
  const response = await GET(new Request("http://localhost/api/provenance/bundle-1/verify"), {
    params: Promise.resolve({ bundleId: "bundle-1" }),
  });
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: "Backend unreachable" });
});
