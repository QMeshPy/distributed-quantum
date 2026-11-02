import { afterEach, expect, mock, test } from "bun:test";

let user = null;
let assertion = null;
mock.module("server-only", () => ({}));
mock.module("../src/features/auth/server/session", () => ({ getSession: async () => ({ user }) }));
mock.module("../src/features/auth/server/backend-assertion", () => ({ backendAssertion: () => assertion }));
const { financeBackendFetch } = await import("../src/shared/server/finance-backend-fetch");
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; user = null; assertion = null; });

test("unauthenticated requests never contact the backend", async () => {
  globalThis.fetch = mock(() => { throw new Error("must not fetch"); });
  expect((await financeBackendFetch("https://backend.invalid")).status).toBe(401);
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

test("callers can name the workflow in the sign-in message", async () => {
  const response = await financeBackendFetch("https://backend.invalid", {}, "Sign in to run pharma analysis.");
  expect(response.status).toBe(401);
  expect((await response.json()).detail).toBe("Sign in to run pharma analysis.");
});

test("missing signing configuration fails closed", async () => {
  user = { id: "owner", email: "owner@example.test" };
  expect((await financeBackendFetch("https://backend.invalid")).status).toBe(503);
});

test("requests use the signed session identity and disable caching", async () => {
  user = { id: "owner", email: "owner@example.test" };
  assertion = "Bearer signed-owner";
  globalThis.fetch = mock(async (_url, init) => {
    expect(init.headers.get("Authorization")).toBe(assertion);
    expect(init.cache).toBe("no-store");
    expect(init.redirect).toBe("error");
    return new Response("{}", { status: 200 });
  });
  expect((await financeBackendFetch("https://backend.invalid", { headers: { Authorization: "Bearer spoofed" } })).status).toBe(200);
});

for (const workflow of ["finance", "options", "risk"]) {
  test(`${workflow} requests a backend attachment and forwards its bytes`, async () => {
    user = { id: "owner", email: "owner@example.test" };
    assertion = "Bearer signed-owner";
    const attachment = '{"bundle":{"summary":{"inputs":{"value":1.0}}}}';
    globalThis.fetch = mock(async (url) => {
      const requestedUrl = new URL(url);
      expect(requestedUrl.pathname).toBe(`/api/v1/${workflow}/job`);
      expect(requestedUrl.searchParams.get("download")).toBe("provenance");
      return new Response(attachment, {
        headers: { "Content-Disposition": 'attachment; filename="price-provenance.json"' },
      });
    });
    const { GET } = await import(`../src/app/api/${workflow}/[jobId]/route`);
    const response = await GET(
      { nextUrl: new URL(`https://app.test/api/${workflow}/job?download=provenance`) },
      { params: Promise.resolve({ jobId: "job" }) },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(attachment);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
}
