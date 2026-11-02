"use client";

import { useEffect, useRef } from "react";

import styles from "../landing.module.css";
import { animate, hash, sizeCanvas, type Grid } from "./pixel-canvas";

const smooth = (t: number) => t * t * (3 - 2 * t);
const noise = (x: number, y: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const top = hash(xi, yi) + (hash(xi + 1, yi) - hash(xi, yi)) * xf;
  const bottom = hash(xi, yi + 1) + (hash(xi + 1, yi + 1) - hash(xi, yi + 1)) * xf;
  return top + (bottom - top) * yf;
};
const fbm = (x: number, y: number) =>
  noise(x, y) * 0.55 + noise(x * 2.03, y * 2.03) * 0.3 + noise(x * 4.1, y * 4.1) * 0.15;

const TONES = ["--glyph-dim", "--glyph-mid", "--glyph-hi", "--glyph-accent"] as const;
type GlyphTone = (typeof TONES)[number];

type Heat = { c: number; r: number; life: number };

/**
 * A field of 0 and 1 characters drifting in diagonal bands, fraying at the
 * top and bottom edges. The pointer leaves a short bright trail.
 */
export function FlowBand({ label }: { label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const style = getComputedStyle(canvas);
    const colors = Object.fromEntries(TONES.map((t) => [t, style.getPropertyValue(t).trim()])) as Record<
      GlyphTone,
      string
    >;
    const font = style.getPropertyValue("--font-data").trim() || "monospace";
    let grid: Grid = size();
    let heat: Heat[] = [];
    let last = 0;

    function size(): Grid {
      const base = sizeCanvas(canvas!);
      const cell = base.width < 640 ? 9 : 11;
      return { ...base, cell, cols: Math.ceil(base.width / cell), rows: Math.ceil(base.height / (cell * 1.25)) };
    }

    const frame = (t: number) => {
      const dt = last ? Math.min(0.1, t - last) : 0;
      last = t;
      heat.forEach((spot) => {
        spot.life -= dt * 1.1;
      });
      heat = heat.filter((spot) => spot.life > 0);

      const { cols, rows, cell, ratio, width, height } = grid;
      const lineH = cell * 1.25;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.font = `${cell}px ${font}`;
      context.textBaseline = "top";

      for (let r = 0; r < rows; r += 1) {
        const edge = Math.min(r, rows - 1 - r) / Math.max(1, rows * 0.25);
        for (let c = 0; c < cols; c += 1) {
          const h = hash(c, r);
          if (edge < 1 && h > edge * 1.1 - 0.05) continue;
          const warp = fbm(c * 0.025 + t * 0.05, r * 0.09 - t * 0.03);
          const band = ((((c * 0.3 + r * 1.3) * 0.02 + warp * 0.8 - t * 0.04) % 1) + 1) % 1;
          if (band < 0.12 || h > 0.97) continue;
          let tone: GlyphTone = band < 0.55 ? "--glyph-dim" : band < 0.84 ? "--glyph-mid" : "--glyph-hi";
          if (hash(c * 7, r * 3 + Math.floor(t * 0.7)) > 0.985) tone = "--glyph-accent";
          for (const spot of heat) {
            if (Math.hypot(c - spot.c, (r - spot.r) * 1.25) < 2.4 * spot.life + 0.8) tone = "--glyph-accent";
          }
          const flip = hash(c + Math.floor(t * 1.5 + h * 6), r) > 0.5;
          context.fillStyle = colors[tone];
          context.fillText(flip ? "1" : "0", c * cell, r * lineH);
        }
      }
    };

    const onMove = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      heat.push({
        c: (event.clientX - box.left) / grid.cell,
        r: (event.clientY - box.top) / (grid.cell * 1.25),
        life: 1,
      });
      if (heat.length > 18) heat.shift();
    };
    canvas.addEventListener("pointermove", onMove);
    const stop = animate(
      canvas,
      frame,
      () => {
        grid = size();
      },
      16,
    );
    return () => {
      stop();
      canvas.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div className={styles.glyphBand}>
      <canvas ref={ref} className={styles.glyphCanvas} role="img" aria-label={label} />
    </div>
  );
}
