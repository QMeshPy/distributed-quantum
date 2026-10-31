import { expect, test } from "bun:test";
import { ARCHITECTURE } from "../src/features/landing/landing-content";

test("the core architecture includes result collection and separates payment from proof", () => {
  expect(ARCHITECTURE.layers.map(layer => layer.key)).toEqual([
    "app", "payments", "coordinator", "mesh", "results", "provenance",
  ]);
  for (const layer of ARCHITECTURE.layers) {
    for (const label of [layer.title, ...layer.callouts]) {
      expect(label.split(/\s+/).length).toBeLessThanOrEqual(3);
    }
  }
});

test("each stage holds its focal position before moving to the next", async () => {
  const { architectureFrame } = await import("../src/features/landing/components/architecture-motion");
  for (const count of [5, 6]) {
    for (let index = 0; index < count; index++) {
      const early = architectureFrame(0.18 + 0.76 * (index + 0.15) / count, count);
      const late = architectureFrame(0.18 + 0.76 * (index + 0.5) / count, count);
      expect(early.position).toBe(index);
      expect(late.position).toBe(index);
      expect(early.active).toBe(index);
      expect(early.focus).toBe(1);
    }
  }
});

test("scrolling is continuous, bounded and reversible through entry and exit", async () => {
  const { architectureFrame } = await import("../src/features/landing/components/architecture-motion");
  const forwards = Array.from({ length: 1001 }, (_, i) => architectureFrame(i / 1000, 6));
  expect(forwards[0].intro).toBe(true);
  expect(forwards.at(-1).position).toBe(5);
  for (let i = 1; i < forwards.length; i++) {
    expect(forwards[i].position).toBeGreaterThanOrEqual(forwards[i - 1].position);
    expect(forwards[i].position - forwards[i - 1].position).toBeLessThan(0.04);
  }
  expect(architectureFrame(-1, 6).position).toBe(0);
  expect(architectureFrame(2, 6).position).toBe(5);
  for (const i of [920, 740, 560, 380, 200, 0]) {
    expect(architectureFrame(i / 1000, 6)).toEqual(forwards[i]);
  }
});
