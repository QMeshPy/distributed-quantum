import { expect, test } from "bun:test";
import { financeResultResponse } from "../src/shared/server/finance-result-response";

test("downloads recorded evidence as a private JSON attachment", async () => {
  const evidence = '{"bundle":{"summary":{"inputs":{"value":1.0,"negative_zero":-0.0,"large":9007199254740993}}}}';
  const res = await financeResultResponse(new Response(evidence, {
    headers: { "Content-Disposition": 'attachment; filename="price-provenance.json"' },
  }), true);
  expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="price-provenance.json"');
  expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await res.text()).toBe(evidence);
});
test("download requests preserve auth and ownership errors", async () => {
  for (const status of [401, 403, 404, 503]) {
    const res = await financeResultResponse(Response.json({ detail: "unavailable" }, { status }), true);
    expect(res.status).toBe(status);
    expect(res.headers.has("Content-Disposition")).toBe(false);
  }
});
test("backends without attachment support do not download a job response", async () => {
  const res = await financeResultResponse(Response.json({ result: null }), true);
  expect(res.status).toBe(502);
  expect(res.headers.has("Content-Disposition")).toBe(false);
});
test("ordinary detail requests retain their response", async () => {
  const body = { result: { value: 42 } };
  const res = await financeResultResponse(Response.json(body), false);
  expect(await res.json()).toEqual(body);
  expect(res.headers.has("Content-Disposition")).toBe(false);
});
