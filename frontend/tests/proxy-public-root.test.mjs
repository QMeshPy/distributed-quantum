import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";

import { proxy } from "../src/proxy.ts";

function request(pathname) {
  return new NextRequest(`https://www.distributed-quantum.com${pathname}`);
}

describe("authentication proxy", () => {
  test("keeps the production landing page public", () => {
    const response = proxy(request("/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  test("continues to protect application routes", () => {
    const response = proxy(request("/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://www.distributed-quantum.com/signin?next=%2Fdashboard",
    );
  });

  test("does not treat lookalike paths as public prefixes", () => {
    const response = proxy(request("/signin-malicious"));

    expect(response.status).toBe(307);
  });

  test("lets the Filecoin API enforce its session without redirecting JSON requests to HTML", () => {
    expect(proxy(request("/api/filecoin/accounts")).status).toBe(200);
    expect(proxy(request("/api/filecoin-malicious/accounts")).status).toBe(307);
    expect(proxy(request("/vault/filecoin")).status).toBe(307);
  });
});
