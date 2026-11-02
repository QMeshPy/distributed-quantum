"use client";

import { useEffect, useRef } from "react";

import styles from "../landing.module.css";

// ── A small stable-fluids solver (Stam, 1999) on a coarse grid ──
// The pointer pushes velocity and drops dye; dye advects, swirls and fades.
// The dye field is the mask that floods the letters with ink.
const NX = 180;
const NY = 64;
const SIZE = (NX + 2) * (NY + 2);
const IX = (i: number, j: number) => i + (NX + 2) * j;

function setBounds(b: number, x: Float32Array) {
  for (let i = 1; i <= NX; i += 1) {
    x[IX(i, 0)] = b === 2 ? -x[IX(i, 1)] : x[IX(i, 1)];
    x[IX(i, NY + 1)] = b === 2 ? -x[IX(i, NY)] : x[IX(i, NY)];
  }
  for (let j = 1; j <= NY; j += 1) {
    x[IX(0, j)] = b === 1 ? -x[IX(1, j)] : x[IX(1, j)];
    x[IX(NX + 1, j)] = b === 1 ? -x[IX(NX, j)] : x[IX(NX, j)];
  }
}

function advect(b: number, d: Float32Array, d0: Float32Array, u: Float32Array, v: Float32Array, dt: number) {
  const dtx = dt * NX;
  const dty = dt * NY;
  for (let j = 1; j <= NY; j += 1) {
    for (let i = 1; i <= NX; i += 1) {
      const x = Math.min(NX + 0.5, Math.max(0.5, i - dtx * u[IX(i, j)]));
      const y = Math.min(NY + 0.5, Math.max(0.5, j - dty * v[IX(i, j)]));
      const i0 = Math.floor(x);
      const j0 = Math.floor(y);
      const s1 = x - i0;
      const t1 = y - j0;
      d[IX(i, j)] =
        (1 - s1) * ((1 - t1) * d0[IX(i0, j0)] + t1 * d0[IX(i0, j0 + 1)]) +
        s1 * ((1 - t1) * d0[IX(i0 + 1, j0)] + t1 * d0[IX(i0 + 1, j0 + 1)]);
    }
  }
  setBounds(b, d);
}

function project(u: Float32Array, v: Float32Array, p: Float32Array, div: Float32Array) {
  for (let j = 1; j <= NY; j += 1) {
    for (let i = 1; i <= NX; i += 1) {
      div[IX(i, j)] = -0.5 * ((u[IX(i + 1, j)] - u[IX(i - 1, j)]) / NX + (v[IX(i, j + 1)] - v[IX(i, j - 1)]) / NY);
      p[IX(i, j)] = 0;
    }
  }
  setBounds(0, div);
  setBounds(0, p);
  for (let k = 0; k < 14; k += 1) {
    for (let j = 1; j <= NY; j += 1) {
      for (let i = 1; i <= NX; i += 1) {
        p[IX(i, j)] = (div[IX(i, j)] + p[IX(i - 1, j)] + p[IX(i + 1, j)] + p[IX(i, j - 1)] + p[IX(i, j + 1)]) / 4;
      }
    }
    setBounds(0, p);
  }
  for (let j = 1; j <= NY; j += 1) {
    for (let i = 1; i <= NX; i += 1) {
      u[IX(i, j)] -= 0.5 * NX * (p[IX(i + 1, j)] - p[IX(i - 1, j)]);
      v[IX(i, j)] -= 0.5 * NY * (p[IX(i, j + 1)] - p[IX(i, j - 1)]);
    }
  }
  setBounds(1, u);
  setBounds(2, v);
}

// One-pixel ring used to draw an outline around filled glyphs.
const OUTLINE: ReadonlyArray<[number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-0.7, -0.7],
  [0.7, -0.7],
  [-0.7, 0.7],
  [0.7, 0.7],
];

// The logo's 5×5 pixel mark.
const MARK: ReadonlyArray<[number, number]> = [
  [0, 0],
  [4, 0],
  [1, 1],
  [3, 1],
  [2, 2],
  [1, 3],
  [3, 3],
  [0, 4],
  [4, 4],
];

/**
 * The footer wordmark, set like the logo (pixel mark + "QMesh"). Its face is a hairline outline that floods with ink wherever the pointer
 * stirs the fluid; the ink swirls, spreads and fades on its own.
 */
export function InkWordmark({ word }: { word: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const css = getComputedStyle(el);
    const ink = css.getPropertyValue("--ink").trim();
    const line = css.getPropertyValue("--ink-muted").trim();
    const ground = css.getPropertyValue("--ground").trim();
    const family = css.getPropertyValue("--font-text").trim() || "sans-serif";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const u = new Float32Array(SIZE);
    const v = new Float32Array(SIZE);
    const u0 = new Float32Array(SIZE);
    const v0 = new Float32Array(SIZE);
    const d = new Float32Array(SIZE);
    const d0 = new Float32Array(SIZE);

    // The dye field becomes an alpha mask at grid resolution, then scales up smoothly.
    const field = document.createElement("canvas");
    field.width = NX;
    field.height = NY;
    const fctx = field.getContext("2d");
    const pixels = fctx?.createImageData(NX, NY);
    const face = document.createElement("canvas");
    const sctx = face.getContext("2d");
    if (!fctx || !pixels || !sctx) return;

    let W = 0;
    let H = 0;
    let ratio = 1;
    let size = 0;
    let textX = 0;
    let baseline = 0;
    let markX = 0;
    let markCell = 0;
    let markTop = 0;

    const layout = () => {
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      W = el.clientWidth;
      H = el.clientHeight;
      for (const c of [el, face]) {
        c.width = Math.round(W * ratio);
        c.height = Math.round(H * ratio);
      }
      // Fit mark + word inside the frame, like the logo lockup.
      size = H * 0.9;
      ctx.font = `600 ${size}px ${family}`;
      const lockW = ctx.measureText(word).width + size * 0.95;
      size *= Math.min(1, (W * 0.9) / lockW);
      ctx.font = `600 ${size}px ${family}`;
      const m = ctx.measureText("Q");
      const cap = ctx.measureText("H").actualBoundingBoxAscent;
      const total = ctx.measureText(word).width + size * 0.95;
      markCell = cap / 5;
      markX = (W - total) / 2;
      textX = markX + size * 0.95;
      // Centre the cap height vertically; descenders ("Q" tail) stay inside.
      baseline = (H - m.actualBoundingBoxDescent) / 2 + cap / 2;
      markTop = baseline - cap;
    };

    const drawMark = (c: CanvasRenderingContext2D, dx: number, dy: number, mode: "fill" | "stroke") => {
      const s = markCell * 0.84;
      for (const [mx, my] of MARK) {
        const x = markX + mx * markCell + dx;
        const y = markTop + my * markCell + dy;
        if (mode === "fill") c.fillRect(x, y, s, s);
        else c.strokeRect(x, y, s, s);
      }
    };

    let pointer: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
    const start = performance.now();
    let last = 0;

    const splat = (gx: number, gy: number, fx: number, fy: number, amount: number, radius: number) => {
      const r2 = radius * radius;
      const i0 = Math.max(1, Math.floor(gx - radius * 2));
      const i1 = Math.min(NX, Math.ceil(gx + radius * 2));
      const j0 = Math.max(1, Math.floor(gy - radius * 2));
      const j1 = Math.min(NY, Math.ceil(gy + radius * 2));
      for (let j = j0; j <= j1; j += 1) {
        for (let i = i0; i <= i1; i += 1) {
          const k = Math.exp(-((i - gx) ** 2 + (j - gy) ** 2) / r2);
          u[IX(i, j)] += fx * k;
          v[IX(i, j)] += fy * k;
          d[IX(i, j)] += amount * k;
        }
      }
    };

    const step = (dt: number) => {
      if (pointer && pointer.moved) {
        const fx = ((pointer.x - pointer.px) / W) * 6;
        const fy = ((pointer.y - pointer.py) / H) * 6;
        splat((pointer.x / W) * NX, (pointer.y / H) * NY, fx, fy, 1.5, 4.2);
        pointer.px = pointer.x;
        pointer.py = pointer.y;
        pointer.moved = false;
      }
      u0.set(u);
      v0.set(v);
      advect(1, u, u0, u0, v0, dt);
      advect(2, v, v0, u0, v0, dt);
      project(u, v, u0, v0);
      d0.set(d);
      advect(0, d, d0, u, v, dt);
      for (let k = 0; k < SIZE; k += 1) {
        u[k] *= 0.992;
        v[k] *= 0.992;
        d[k] *= 0.985; // the ink slowly lets go
      }
    };

    const draw = () => {
      // Dye → alpha with a soft threshold, so the ink reads as a liquid edge.
      const data = pixels.data;
      for (let j = 0; j < NY; j += 1) {
        for (let i = 0; i < NX; i += 1) {
          const x = Math.min(1, Math.max(0, (d[IX(i + 1, j + 1)] - 0.08) / 0.32));
          data[(i + j * NX) * 4 + 3] = Math.round(x * x * (3 - 2 * x) * 255);
        }
      }
      fctx.putImageData(pixels, 0, 0);

      // Ink-filled face, kept only where there is dye.
      sctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      sctx.globalCompositeOperation = "source-over";
      sctx.clearRect(0, 0, W, H);
      sctx.fillStyle = ink;
      sctx.font = `600 ${size}px ${family}`;
      sctx.textBaseline = "alphabetic";
      sctx.fillText(word, textX, baseline);
      drawMark(sctx, 0, 0, "fill");
      sctx.globalCompositeOperation = "destination-in";
      sctx.imageSmoothingEnabled = true;
      sctx.drawImage(field, 0, 0, W, H);

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.font = `600 ${size}px ${family}`;
      ctx.textBaseline = "alphabetic";

      // Clean outline from the filled shape (strokeText would trace the font's overlapping
      // contours): the letters in the line colour, nudged a pixel each way, then the face on top.
      ctx.fillStyle = line;
      for (const [ox, oy] of OUTLINE) {
        ctx.fillText(word, textX + ox, baseline + oy);
        drawMark(ctx, ox, oy, "fill");
      }
      ctx.fillStyle = ground;
      ctx.fillText(word, textX, baseline);
      drawMark(ctx, 0, 0, "fill");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(face, 0, 0);
    };

    let raf = 0;
    let visible = false;
    // The first time the footer comes into view, one stroke of ink sweeps through the word,
    // so it reads as inkable on touch screens too; then it lets go like any other stroke.
    let sweepFrom = -1;
    const SWEEP = 1.8;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      const t = (now - start) / 1000;
      const dt = last ? Math.min(0.033, t - last) : 0.016;
      last = t;
      if (sweepFrom < 0) sweepFrom = t;
      const k = (t - sweepFrom) / SWEEP;
      if (k <= 1 && !pointer?.moved) {
        const e = 1 - Math.pow(1 - k, 3);
        const x = W * (0.04 + 0.92 * e);
        const y = H * (0.5 + 0.18 * Math.sin(e * Math.PI * 2.2));
        const prev = sweepPoint ?? { x, y };
        splat((x / W) * NX, (y / H) * NY, ((x - prev.x) / W) * 6, ((y - prev.y) / H) * 6, 1.1, 4.6);
        sweepPoint = { x, y };
      }
      step(dt * 0.6);
      draw();
    };
    let sweepPoint: { x: number; y: number } | null = null;

    const onMove = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      const x = e.clientX - box.left;
      const y = e.clientY - box.top;
      if (!pointer) pointer = { x, y, px: x, py: y, moved: false };
      pointer.x = x;
      pointer.y = y;
      pointer.moved = true;
    };
    const onLeave = () => {
      pointer = null;
    };

    layout();
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(el);
    const ro = new ResizeObserver(() => {
      layout();
      draw();
    });
    ro.observe(el);
    void document.fonts.ready.then(() => {
      layout();
      draw();
    });
    if (reduce) {
      draw();
    } else {
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onLeave);
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [word]);

  return <canvas ref={ref} className={styles.inkCanvas} role="img" aria-label={word} />;
}
