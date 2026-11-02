import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BUILT_ON } from "../src/features/landing/landing-content";
import { InfrastructureStrip } from "../src/features/landing/components/infrastructure-strip";

test("infrastructure names are unique and their roles use two or three words", () => {
  const items = BUILT_ON.rows.flat();
  expect(new Set(items.map(item => item.name)).size).toBe(items.length);
  for (const item of items) {
    expect(item.role.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2);
    expect(item.role.trim().split(/\s+/).length).toBeLessThanOrEqual(3);
  }
});

test("the strip labels its lists, hides loop copies, and exposes a pause control", () => {
  const html = renderToStaticMarkup(<InfrastructureStrip />);
  expect(html.includes('aria-labelledby="infrastructure-title"')).toBe(true);
  expect(html.includes('aria-label="Pause motion"')).toBe(true);
  expect([...html.matchAll(/<ul\b/g)]).toHaveLength(4);
  expect([...html.matchAll(/<ul\b[^>]*aria-hidden="true"/g)]).toHaveLength(2);
  expect(html.includes("Coinbase CDP")).toBe(true);
  expect(html.includes("NEAR AI Cloud")).toBe(true);
});
