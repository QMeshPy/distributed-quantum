"use client";

import { ArrowUpRight } from "lucide-react";
import { useMotionValueEvent, useScroll } from "motion/react";
import { useEffect, useRef, useState } from "react";

import type { RESULTS } from "../landing-content";
import styles from "../landing.module.css";
import { hash } from "./pixel-canvas";

type Story = (typeof RESULTS)["story"];
type Pt = [number, number];

// ── Scroll timeline, matched to giga.ai's Build → Observe → Improve → loop ──
const K = {
  drawStrands: [0.0, 0.08],
  meshTitle: [0.0, 0.14],
  pan: [0.16, 0.22],
  runTitle: [0.18, 0.26],
  burst: [0.22, 0.29],
  rows: [0.42, 0.48],
  collapse: [0.55, 0.6],
  scaleTitle: [0.55, 0.66],
  baseline: [0.6, 0.65],
  curve: [0.66, 0.78],
  loopOut: [0.86, 0.9],
  loopIn: [0.9, 0.97],
} as const;
const PHASE_AT = [0, 0.18, 0.55];
const N = 2400;
const STARS = 900; // background field, present through every act
const SOURCES = [12, 7, 9]; // dots per source column, like Giga's Knowledge / Tools / Guidance

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const span = ([a, b]: readonly [number, number], f: number) => clamp((f - a) / (b - a));
const ease = (n: number) => (n < 0.5 ? 4 * n * n * n : 1 - Math.pow(-2 * n + 2, 3) / 2);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
/** Rises over [a, b] then falls over [c, d]. */
const window4 = (f: number, a: number, b: number, c: number, d: number) =>
  clamp((f - a) / (b - a)) * (1 - clamp((f - c) / (d - c)));

const bezier = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, u: number): Pt => {
  const v = 1 - u;
  return [
    v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0],
    v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1],
  ];
};

/** QAOA speedup over classical: measured at 40 (3.2×) and 60 (9.5×); rises from parity past 20 assets. */
const speedup = (assets: number) => {
  if (assets <= 20) return 1;
  if (assets <= 40) return 1 + 2.2 * Math.pow((assets - 20) / 20, 1.7);
  return 3.2 * Math.pow(9.5 / 3.2, (assets - 40) / 20);
};

const ACCENTS = ["--accent-1", "--accent-2", "--accent-3", "--accent-4", "--accent-5"] as const;

export function ResultsStory({ story, paperHref }: { story: Story; paperHref: string }) {
  const track = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const titles = useRef<(HTMLDivElement | null)[]>([]);
  const progress = useRef(0);
  const [phase, setPhase] = useState(0);
  const { scrollYProgress } = useScroll({ target: track, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    progress.current = v;
    const next = v >= PHASE_AT[2] ? 2 : v >= PHASE_AT[1] ? 1 : 0;
    setPhase((prev) => (prev === next ? prev : next));
  });

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const css = getComputedStyle(el);
    const color = (name: string) => css.getPropertyValue(name).trim();
    const ink = color("--ink");
    const muted = color("--ink-muted");
    const faint = color("--ink-faint");
    const hair = color("--hairline");
    const accents = ACCENTS.map(color);
    const mono = color("--font-data") || "monospace";
    const sans = color("--font-text") || "sans-serif";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cats = story.rows.length;

    let W = 0;
    let H = 0;
    let ratio = 1;
    const resize = () => {
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      W = el.clientWidth;
      H = el.clientHeight;
      el.width = Math.round(W * ratio);
      el.height = Math.round(H * ratio);
    };

    // Per-particle constants, computed once.
    const P = Array.from({ length: N }, (_, i) => {
      const c = i % cats;
      const j = Math.floor(i / cats); // index within its category
      return { c, h1: hash(i, 1), h2: hash(i, 2), h3: hash(i, 3), lum: hash(i, 7), sub: j % 3, col: Math.floor(j / 3) };
    });
    const perCat = Math.ceil(N / cats / 3); // grid columns per category
    const BG = Array.from({ length: STARS }, (_, i) => ({
      x: hash(i, 11),
      y: hash(i, 12),
      depth: 0.2 + hash(i, 13) * 0.8,
      tw: hash(i, 14) * 40,
      hue: hash(i, 15),
    }));

    let raf = 0;
    let visible = true;
    const start = performance.now();
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(el);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!visible) return;
      const f = progress.current;
      const t = reduce ? 4 : (performance.now() - start) / 1000;
      const narrow = W < 720;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Deep field: a faint galaxy of stars drifting in parallax behind every act,
      // brightest while the run is scattered across the sky.
      const sky = 0.35 + 0.55 * window4(f, K.burst[0], K.burst[1], K.rows[1], K.collapse[1]);
      for (let i = 0; i < BG.length; i += 1) {
        const s0 = BG[i];
        const x = (((s0.x + t * 0.004 * s0.depth + f * 0.15 * s0.depth) % 1) + 1) % 1;
        const y = (((s0.y - f * 0.08 * s0.depth) % 1) + 1) % 1;
        const tw = 0.45 + 0.55 * Math.sin(t * (0.8 + s0.depth) + s0.tw);
        ctx.globalAlpha = sky * tw * (0.25 + 0.55 * s0.depth);
        ctx.fillStyle = s0.hue > 0.86 ? accents[4] : s0.hue > 0.78 ? accents[1] : ink;
        const r = 0.35 + s0.depth * 0.9;
        ctx.fillRect(x * W - r, y * H - r, r * 2, r * 2);
      }
      // Titles: each fades in, then out once its act gets going (DOM, driven from here).
      const tOp = [
        window4(f, -1, 0, K.meshTitle[1], K.meshTitle[1] + 0.04),
        window4(f, K.runTitle[0], K.runTitle[0] + 0.04, K.runTitle[1], K.runTitle[1] + 0.04),
        window4(f, K.scaleTitle[0], K.scaleTitle[0] + 0.04, K.scaleTitle[1], K.scaleTitle[1] + 0.04),
        window4(f, K.loopIn[0], K.loopIn[0] + 0.03, 2, 3),
      ];
      titles.current.forEach((node, k) => {
        if (node) {
          node.style.opacity = String(tOp[k]);
          node.style.translate = `-50% ${(1 - tOp[k]) * 10}px`;
        }
      });

      // ── Geometry ──
      const loopIn = ease(span(K.loopIn, f));
      // The point pans to centre for Run, and back home for the loop.
      const pan = ease(span(K.pan, f)) * (1 - loopIn);
      const home = W * (narrow ? 0.72 : 0.66);
      const point: Pt = [mix(home, W * 0.5, pan), mix(H * 0.6, H * 0.55, pan)];
      const shift = point[0] - home;
      const srcX = [W * 0.09, W * 0.07, W * 0.1].map((x) => x + shift);
      const srcY = narrow ? [H * 0.33, H * 0.55, H * 0.72] : [H * 0.24, H * 0.53, H * 0.7];
      const dotGap = narrow ? 7 : 9;

      // ── Act 1 (and the loop): strands from every source dot into one point ──
      const drawStrands = ease(span(K.drawStrands, f));
      const strandFade = 1 - ease(span(K.pan, f));
      const strandsAlpha = Math.max(strandFade * (f < K.loopOut[0] ? 1 : 0), loopIn);
      const reveal = f >= K.loopIn[0] ? loopIn : drawStrands;
      const tinted = f >= K.loopIn[0];
      if (strandsAlpha > 0.01) {
        SOURCES.forEach((count, g) => {
          const x0 = srcX[g];
          const groupMid = srcY[g] + ((count - 1) * dotGap) / 2;
          // Faint echo columns trailing right, as in the reference.
          for (let e = 1; e <= 3; e += 1) {
            const n = Math.max(2, count - e * 3);
            ctx.globalAlpha = strandsAlpha * reveal * (0.5 - e * 0.12);
            ctx.fillStyle = muted;
            for (let k = 0; k < n; k += 1) {
              ctx.fillRect(x0 + e * (narrow ? 28 : 48), groupMid - ((n - 1) * dotGap) / 2 + k * dotGap - 0.6, 1.2, 1.2);
            }
          }
          for (let k = 0; k < count; k += 1) {
            const p0: Pt = [x0, srcY[g] + k * dotGap];
            const dx = point[0] - p0[0];
            const p1: Pt = [p0[0] + dx * 0.5, mix(p0[1], groupMid, 0.35)];
            const p2: Pt = [p0[0] + dx * 0.58, point[1]];
            ctx.strokeStyle = tinted ? accents[4] : muted;
            ctx.lineWidth = 0.7;
            ctx.globalAlpha = strandsAlpha * 0.6;
            ctx.beginPath();
            const steps = 60;
            for (let s = 0; s <= steps * reveal; s += 1) {
              const [x, y] = bezier(p0, p1, p2, point, s / steps);
              if (s === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.stroke();
            // Source dot.
            ctx.globalAlpha = strandsAlpha * reveal;
            ctx.fillStyle = tinted ? accents[(g * 2 + k) % 5] : ink;
            ctx.fillRect(p0[0] - 1.2, p0[1] - 1.2, 2.4, 2.4);
            // Glints travelling along the strand.
            if (!reduce && reveal > 0.98) {
              const u = (hash(g * 31 + k, 9) + t * (0.08 + hash(k, g) * 0.05)) % 1;
              const [gx, gy] = bezier(p0, p1, p2, point, u);
              // Only some strands carry a glint at any moment, as in the reference.
              if (hash(g * 13 + k, Math.floor(t * 0.4)) < 0.55) continue;
              ctx.globalAlpha = strandsAlpha * 0.6 * Math.sin(u * Math.PI);
              ctx.fillStyle = ink;
              ctx.fillRect(gx - 1.5, gy - 1.5, 3, 3);
            }
          }
          // Source label above its column.
          ctx.globalAlpha = strandsAlpha * reveal;
          ctx.fillStyle = muted;
          ctx.font = `${narrow ? 12 : 14}px ${sans}`;
          ctx.textBaseline = "alphabetic";
          ctx.fillText(story.sources[g], x0 - 2, srcY[g] - 18);
        });
      }

      // ── The point (persists from Build through the burst, and returns in the loop) ──
      const burst = ease(span(K.burst, f));
      const pointAlpha = f < K.collapse[0] ? 1 - span([K.rows[0], K.rows[1]], f) : loopIn;
      if (pointAlpha > 0.01) {
        ctx.globalAlpha = pointAlpha;
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.roundRect(point[0] - 3.5, point[1] - 3.5, 7, 7, 1.5);
        ctx.fill();
        const labelAlpha = f < K.pan[0] ? drawStrands : tinted ? loopIn : 1 - pan;
        ctx.globalAlpha = labelAlpha;
        ctx.font = `${narrow ? 12 : 14}px ${sans}`;
        ctx.textBaseline = "middle";
        const pointLabel = tinted ? story.pointLoop : story.point;
        if (narrow) {
          // Too little room to the right of the point: sit above it, kept on the stage.
          const half = ctx.measureText(pointLabel).width / 2;
          ctx.textAlign = "center";
          ctx.fillText(pointLabel, Math.min(point[0], W - half - 10), point[1] - 18);
          ctx.textAlign = "left";
        } else {
          ctx.fillText(pointLabel, point[0] + 12, point[1]);
        }
      }

      // ── Act 2: burst → dot-matrix rows ──
      const rows = ease(span(K.rows, f));
      const collapse = ease(span(K.collapse, f));
      const field = burst * (1 - collapse);
      const rowX0 = W * (narrow ? 0.3 : 0.2);
      const rowX1 = W * 0.92;
      const rowY = (c: number) => H * (0.3 + c * 0.1);
      const step = (rowX1 - rowX0) / perCat;
      const chart = { x0: W * 0.14, x1: W * 0.76, base: H * 0.74, top: H * 0.22 };
      const ax = (a: number) => mix(chart.x0, chart.x1, (a - 10) / 50);
      const ay = (v: number) => chart.base - ((v - 1) / 8.5) * (chart.base - chart.top);

      if (field > 0.005) {
        for (const p of P) {
          // A: born at the point, B: flung across the stage, C: a matrix row, D: the baseline.
          const bx = W * (0.04 + 0.92 * p.h1);
          const by = H * (0.12 + 0.76 * p.h2);
          const gap = hash(Math.floor(p.col / 4), p.c * 7 + p.sub) > 0.82 || p.h3 > 0.9;
          const dx = rowX0 + p.col * step;
          const dy = rowY(p.c) + (p.sub - 1) * (narrow ? 5 : 7);
          const ex = mix(chart.x0, chart.x1, p.h1);

          let x = mix(point[0], bx, burst);
          let y = mix(point[1], by, burst);
          x = mix(x, dx, rows);
          y = mix(y, dy, rows);
          x = mix(x, ex, collapse);
          y = mix(y, chart.base, collapse);

          const twinkle = 0.5 + 0.5 * Math.sin(t * 1.7 + p.h2 * 40);
          const bright = p.lum > 0.93 && rows < 0.5;
          let a = field * (0.35 + 0.65 * twinkle);
          if (rows > 0.5) a = gap ? 0 : 0.8 * (1 - collapse);
          if (a < 0.02) continue;
          ctx.globalAlpha = a;
          ctx.fillStyle = bright ? ink : accents[p.c];
          const size = rows > 0.5 ? (narrow ? 1.6 : 2) : bright ? 2.4 : 1 + p.h3 * 1.2;
          ctx.beginPath();
          ctx.arc(x, y, size / 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Row labels once lined up.
        ctx.font = `${narrow ? 10 : 12}px ${sans}`;
        ctx.textBaseline = "middle";
        const lbl = rows * (1 - collapse);
        if (lbl > 0.01) {
          ctx.globalAlpha = lbl;
          ctx.fillStyle = muted;
          story.rows.forEach((r, c) => ctx.fillText(r, W * (narrow ? 0.03 : 0.07), rowY(c)));
          ctx.fillStyle = faint;
          ctx.fillText(story.runAxis[0], rowX0, rowY(0) - 30);
          ctx.textAlign = "right";
          ctx.fillText(story.runAxis[1], rowX1, rowY(0) - 30);
          ctx.fillText(story.runNote, rowX1, rowY(cats - 1) + 34);
          ctx.textAlign = "left";
        }
      }

      // ── Act 3: baseline draws to a point, then the glowing curve rises ──
      const base = ease(span(K.baseline, f));
      const curve = ease(span(K.curve, f));
      const loopOut = ease(span(K.loopOut, f));
      const chartAlpha = base * (1 - loopOut);
      if (chartAlpha > 0.01) {
        ctx.font = `${narrow ? 10 : 12}px ${sans}`;
        ctx.textBaseline = "middle";
        const left = chart.x0 - W * 0.06;
        const bxEnd = mix(left, chart.x1, base);
        ctx.globalAlpha = chartAlpha;
        ctx.strokeStyle = muted;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, chart.base);
        ctx.lineTo(bxEnd, chart.base);
        ctx.stroke();
        ctx.fillStyle = ink;
        ctx.fillRect(bxEnd - 2.5, chart.base - 2.5, 5, 5);
        ctx.fillStyle = faint;
        ctx.fillText(story.chart.baselineLabel, chart.x0 + W * 0.02, chart.base - 14);

        if (curve > 0) {
          const end = 20 + 40 * curve;
          const gx = ax(end);
          const gy = ay(speedup(end));
          ctx.globalAlpha = chartAlpha;
          ctx.strokeStyle = accents[4];
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let a = 20; a <= end; a += 0.4) {
            const x = ax(a);
            const y = ay(speedup(a));
            if (a === 20) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.fillStyle = ink;
          ctx.beginPath();
          ctx.roundRect(gx - 3.5, gy - 3.5, 7, 7, 1.5);
          ctx.fill();
          // Marker, measured points, gain bracket and "current", as in the reference.
          ctx.fillStyle = faint;
          ctx.textAlign = "center";
          ctx.fillRect(ax(20) - 0.5, chart.base - 4, 1, 8);
          ctx.fillText(story.chart.marker, ax(20), chart.base + 20);
          if (end >= 40) {
            ctx.fillStyle = accents[4];
            ctx.beginPath();
            ctx.arc(ax(40), ay(3.2), 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = muted;
            ctx.textAlign = "right";
            ctx.fillText(story.chart.points[0].label, ax(40) - 10, ay(3.2) - 10);
          }
          if (end >= 59.9) {
            const bx = ax(60) + 24;
            ctx.strokeStyle = hair;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(bx, ay(9.5));
            ctx.lineTo(bx, chart.base);
            ctx.stroke();
            ctx.fillStyle = muted;
            ctx.textAlign = "center";
            ctx.fillText(story.chart.points[1].label, ax(60), ay(9.5) - 22);
            ctx.textAlign = "left";
            ctx.fillText(story.chart.gain, bx + 8, (ay(9.5) + chart.base) / 2);
            ctx.fillStyle = faint;
            ctx.textAlign = "center";
            ctx.fillText(story.chart.current, ax(60), chart.base + 20);
            ctx.font = `${narrow ? 9 : 11}px ${mono}`;
            ctx.textAlign = "left";
            ctx.fillText(story.chart.note, left, chart.base + 52);
          }
          ctx.textAlign = "left";
        }
      }
      // The curve collapses back into the point before the loop.
      if (loopOut > 0 && loopOut < 1) {
        const x = mix(ax(60), point[0], loopOut);
        const y = mix(ay(9.5), point[1], loopOut);
        ctx.globalAlpha = 1;
        ctx.fillStyle = ink;
        ctx.fillRect(x - 3, y - 3, 6, 6);
      }
      ctx.globalAlpha = 1;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [story]);

  const jump = (k: number) => {
    const el = track.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const range = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + range * (PHASE_AT[k] + 0.06), behavior: "smooth" });
  };

  const heads = [...story.phases, story.loop];
  return (
    <div ref={track} className={styles.storyTrack}>
      <div className={styles.storyStage}>
        <canvas ref={canvas} className={styles.storyCanvas} role="img" aria-label={story.label} />
        {heads.map((h, k) => (
          <div
            key={h.title}
            ref={(node) => {
              titles.current[k] = node;
            }}
            className={styles.storyTitle}
            data-loop={k === 3}
            style={{ opacity: 0 }}
          >
            <h3>{h.title}</h3>
            <p>{h.body}</p>
          </div>
        ))}
        <div className={styles.storyTabs} role="group" aria-label="Story acts">
          {story.phases.map((p, k) => (
            <button key={p.key} type="button" aria-pressed={k === phase} onClick={() => jump(k)}>
              {p.title.replace(".", "").toUpperCase()}
            </button>
          ))}
          <a href={paperHref} target="_blank" rel="noreferrer" className={styles.storyTabLink}>
            <span className={styles.storyTabDot} aria-hidden="true" />
            {story.action.toUpperCase()} <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
}
