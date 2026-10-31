import { afterEach, expect, mock, test } from "bun:test";

let user = null;
let assertion = null;
mock.module("server-only", () => ({}));
mock.module("../src/features/auth/server/session", () => ({ getSession: async () => ({ user }) }));
mock.module("../src/features/auth/server/backend-assertion", () => ({ backendAssertion: () => assertion }));

const runList = await import("../src/app/api/runs/route");
const runDetail = await import("../src/app/api/runs/[runId]/route");
const runPlan = await import("../src/app/api/runs/plan/[planId]/route");
const sessions = await import("../src/app/api/agentkit/sessions/route");
const session = await import("../src/app/api/agentkit/sessions/[id]/route");
const messages = await import("../src/app/api/agentkit/sessions/[id]/messages/route");
const pharma = await import("../src/app/api/pharma/route");
const pharmaJob = await import("../src/app/api/pharma/[jobId]/route");
const pharmaLive = await import("../src/app/api/pharma/[jobId]/live/route");
const { getRunsList, getRunDetail } = await import("../src/features/runs/server/runs-service");

const request = () => new Request("https://app.test/api", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer spoofed" },
  body: JSON.stringify({ message: "hello" }),
});
const runParams = { params: Promise.resolve({ runId: "run-1" }) };
const sessionParams = { params: Promise.resolve({ id: "session-1" }) };
const pharmaParams = { params: Promise.resolve({ jobId: "pharma-1" }) };
const routes = [
  ["run list", () => runList.GET()],
  ["run detail", () => runDetail.GET(request(), runParams)],
  ["run plan", () => runPlan.GET(request(), { params: Promise.resolve({ planId: "plan-1" }) })],
  ["legacy session list", () => sessions.GET()],
  ["legacy session create", () => sessions.POST(request())],
  ["legacy session detail", () => session.GET(request(), sessionParams)],
  ["legacy session delete", () => session.DELETE(request(), sessionParams)],
  ["legacy session message", () => messages.POST(request(), sessionParams)],
  ["pharma list", () => pharma.GET()],
  ["pharma submit", () => pharma.POST(request())],
  ["pharma detail", () => pharmaJob.GET(request(), pharmaParams)],
  ["pharma cancel", () => pharmaJob.DELETE(request(), pharmaParams)],
  ["pharma live", () => pharmaLive.GET(request(), pharmaParams)],
];
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  user = null;
  assertion = null;
});

for (const [name, call] of routes) {
  test(`${name} requires a signed-in identity before contacting the backend`, async () => {
    globalThis.fetch = mock(async () => Response.json({}));
    expect((await call()).status).toBe(401);
    user = { id: "owner", email: "owner@example.test" };
    expect((await call()).status).toBe(503);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test(`${name} forwards signed identity and preserves backend status`, async () => {
    user = { id: "owner", email: "owner@example.test" };
    assertion = "Bearer signed-owner";
    globalThis.fetch = mock(async (_url, init) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe(assertion);
      expect(init?.cache).toBe("no-store");
      expect(init?.redirect).toBe("error");
      return Response.json({ message: "Forbidden" }, { status: 403 });
    });
    const response = await call();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: "Forbidden" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
}

test("legacy session deletion retains its empty 204 response", async () => {
  user = { id: "owner", email: "owner@example.test" };
  assertion = "Bearer signed-owner";
  globalThis.fetch = mock(async () => new Response(null, { status: 204 }));
  const response = await session.DELETE(request(), sessionParams);
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
});

test("pharma submission forwards its body and returns the accepted job", async () => {
  user = { id: "owner", email: "owner@example.test" };
  assertion = "Bearer signed-owner";
  globalThis.fetch = mock(async (url, init) => {
    expect(new URL(url).pathname).toBe("/api/v1/pharma/submit");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(new Headers(init.headers).get("Authorization")).toBe(assertion);
    expect(JSON.parse(init.body)).toEqual({ message: "hello" });
    return Response.json({ job_id: "pharma-1" }, { status: 202 });
  });
  const response = await pharma.POST(request());
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ job_id: "pharma-1" });
});

test("pharma cancellation and unavailable live data preserve their empty responses", async () => {
  user = { id: "owner", email: "owner@example.test" };
  assertion = "Bearer signed-owner";
  globalThis.fetch = mock(async (url, init) => {
    expect(new Headers(init.headers).get("Authorization")).toBe(assertion);
    if (new URL(url).pathname.endsWith("/live")) return new Response(null, { status: 404 });
    expect(new URL(url).pathname).toBe("/api/v1/pharma/jobs/pharma-1");
    expect(init.method).toBe("DELETE");
    return new Response(null, { status: 204 });
  });
  const canceled = await pharmaJob.DELETE(request(), pharmaParams);
  expect(canceled.status).toBe(204);
  expect(await canceled.text()).toBe("");
  const live = await pharmaLive.GET(request(), pharmaParams);
  expect(live.status).toBe(404);
  expect(await live.text()).toBe("");
});

test("server run reads fail closed and fetch separately for each signed-in user", async () => {
  globalThis.fetch = mock(async () => Response.json([]));
  expect(await getRunsList()).toBeNull();
  expect(await getRunDetail("run-1")).toBeNull();
  expect(globalThis.fetch).not.toHaveBeenCalled();
  globalThis.fetch = mock(async (url, init) => {
    expect(new Headers(init?.headers).get("Authorization")).toBe(assertion);
    expect(init?.cache).toBe("no-store");
    expect(init?.redirect).toBe("error");
    const job = { job_id: user.id, status: "queued" };
    return Response.json(new URL(url).pathname.endsWith("/jobs") ? [job] : job);
  });
  for (const id of ["owner-1", "owner-2"]) {
    user = { id, email: `${id}@example.test` };
    assertion = `Bearer signed-${id}`;
    expect((await getRunsList())[0].jobId).toBe(id);
    expect((await getRunDetail("run-1")).jobId).toBe(id);
  }
  expect(globalThis.fetch).toHaveBeenCalledTimes(4);
});
