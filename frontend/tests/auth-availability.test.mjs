import { afterEach, expect, mock, spyOn, test } from "bun:test";

const findOne = mock(async () => ({ _id: "user-1" }));
const getDatabase = mock(async () => ({ collection: () => ({ findOne }) }));
const handler = mock(async () => Response.json({ success: true }));
const getAuth = mock(async () => ({ handler }));
mock.module("../src/shared/lib/mongodb", () => ({ getDatabase }));
mock.module("../src/features/auth/server/auth", () => ({ getAuth }));
const emailRoute = await import("../src/app/api/auth/check-email/route");
const authRoute = await import("../src/app/api/auth/[...all]/route");
const originalFetch = globalThis.fetch;
const log = spyOn(console, "error").mockImplementation(() => {});
afterEach(() => {
  globalThis.fetch = originalFetch;
  getDatabase.mockClear();
  findOne.mockClear();
  getAuth.mockClear();
  log.mockClear();
});

const request = (body) => new Request("http://localhost:3000/api/auth/check-email", {
  method: "POST", headers: { "Content-Type": "application/json" }, body,
});

test("email lookup rejects malformed input before accessing MongoDB", async () => {
  for (const body of ["{", "null", '{}', '{"email":{}}', '{"email":"bad"}']) {
    const response = await emailRoute.POST(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("message");
  }
  expect(getDatabase).not.toHaveBeenCalled();
});

test("email lookup normalizes the address and retains the existing-account decision", async () => {
  const response = await emailRoute.POST(request('{"email":" User@Example.test "}'));
  expect(await response.json()).toEqual({ exists: true });
  expect(findOne).toHaveBeenCalledWith({ email: "user@example.test" }, { projection: { _id: 1 } });
  findOne.mockResolvedValueOnce(null);
  expect(await (await emailRoute.POST(request('{"email":"new@example.test"}'))).json()).toEqual({ exists: false });
});

test("email lookup returns a safe JSON outage instead of an empty 500", async () => {
  getDatabase.mockRejectedValueOnce(new Error("private database detail"));
  const response = await emailRoute.POST(request('{"email":"user@example.test"}'));
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body.message).toContain("temporarily unavailable");
  expect(JSON.stringify(body)).not.toContain("private database detail");
  expect(JSON.stringify(log.mock.calls)).not.toContain("private database detail");
});

test("both auth methods return JSON when auth cannot initialize", async () => {
  for (const method of ["GET", "POST"]) {
    getAuth.mockRejectedValueOnce(new Error("private database detail"));
    const response = await authRoute[method](new Request("http://localhost:3000/api/auth/get-session", { method }));
    expect(response.status).toBe(503);
    expect((await response.json()).message).toContain("temporarily unavailable");
  }
  expect(JSON.stringify(log.mock.calls)).not.toContain("private database detail");
});

test("auth preserves the provider's status and body", async () => {
  handler.mockResolvedValueOnce(Response.json({ message: "Too many attempts" }, { status: 429 }));
  const response = await authRoute.POST(request('{}'));
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ message: "Too many attempts" });
});

test("auth normalizes an empty 500 returned by Better Auth after a runtime database failure", async () => {
  handler.mockResolvedValueOnce(new Response(null, { status: 500 }));
  const response = await authRoute.POST(request('{}'));
  expect(response.status).toBe(503);
  expect((await response.json()).message).toContain("temporarily unavailable");
});

test("the shared email check handles empty failure responses and malformed success responses", async () => {
  const { checkEmailExists } = await import("../src/features/auth/lib/check-email");
  for (const response of [new Response(null, { status: 500 }), Response.json({}), Response.json({ exists: "false" }), new Response("broken")]) {
    globalThis.fetch = mock(async () => response);
    await expect(checkEmailExists("user@example.test")).rejects.toThrow("temporarily unavailable");
  }
  for (const exists of [true, false]) {
    globalThis.fetch = mock(async () => Response.json({ exists }));
    expect(await checkEmailExists("user@example.test")).toBe(exists);
  }
});
