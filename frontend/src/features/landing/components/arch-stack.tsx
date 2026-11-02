"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { useRef, useState } from "react";

import type { Layer } from "../landing-content";
import styles from "../landing.module.css";
import { DRAW, type Kind } from "./devices";
import { add, clamp, COS, iso, plane, pts, SIN, type V3 } from "./iso";

// ── Choreography, measured from griffin.com's "built to evolve" section ──
// The intro holds the heading with the plates evenly spread; then each layer
// takes the centre while passed plates stack tightly above and upcoming ones
// compress below.
// Griffin's offsets, opened up so the raised objects on each plate have room.
const INTRO_GAP = 128; // px between plates while the intro heading shows
// Wide gaps either side of the active plate leave room for its labels.
const SLOTS: ReadonlyArray<[number, number]> = [
  [-4, -660],
  [-3, -590],
  [-2, -515],
  [-1, -440],
  [0, 0],
  [1, 440],
  [2, 590],
  [3, 630],
  [4, 655],
];
const CENTER_Y = 420; // active step and plate centre in the 900-tall stage
const STEP_PITCH = 30; // px between collapsed step labels
const EASE = [0.16, 1, 0.3, 1] as const;
const STAGE = 900; // Griffin's stage height; positions scale with the real viewport
const at = (px: number) => `calc(${(px / STAGE).toFixed(4)} * var(--stage))`;

const slotY = (s: number) => {
  if (s <= SLOTS[0][0]) return SLOTS[0][1];
  for (let k = 1; k < SLOTS.length; k += 1) {
    const [s1, y1] = SLOTS[k];
    const [s0, y0] = SLOTS[k - 1];
    if (s <= s1) return y0 + ((y1 - y0) * (s - s0)) / (s1 - s0);
  }
  return SLOTS[SLOTS.length - 1][1];
};
const smooth = (n: number) => {
  const c = clamp(n);
  return c * c * (3 - 2 * c);
};

// Plate geometry (world units → about 470px wide on screen).
const S = 270;
const T = 16;
const ORIGIN: V3 = [-S / 2, -S / 2, 0];

const ACCENTS = ["var(--accent-1)", "var(--accent-2)", "var(--accent-3)", "var(--accent-4)", "var(--accent-5)"];

export function ArchStack({
  title,
  body,
  layers,
}: {
  title: readonly [string, string];
  body: string;
  layers: ReadonlyArray<Layer>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [f, setF] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (value) => setF(Math.round(value * 1000) / 1000));

  const n = layers.length;
  // Intro until 12%, then each layer gets an equal share of the scroll.
  const p = clamp((f - 0.2) / 0.72) * (n - 1);
  const blend = smooth((f - 0.04) / 0.16);
  const intro = f < 0.12;
  const active = intro ? -1 : Math.round(p);
  const settled = !intro && Math.abs(p - active) < 0.22 && blend > 0.98;
  const passedTop = active > 0 ? 80 + (active - 1) * STEP_PITCH + 7 : 0;

  const plateY = (i: number) => {
    const spread = (i - (n - 1) / 2) * INTRO_GAP;
    return spread + (slotY(i - p) - spread) * blend;
  };

  return (
    <div ref={ref} className={styles.archTrack} style={{ height: `${n * 150 + 60}vh` }}>
      <div className={styles.archPin}>
        <div className={styles.archLeft}>
          <span className={styles.archRail} aria-hidden="true" />
          {active >= 0 ? (
            <span
              className={styles.archRailLit}
              aria-hidden="true"
              style={{
                top: at(passedTop),
                height: at(CENTER_Y + 7 - passedTop),
                ["--step-accent" as string]: ACCENTS[active],
              }}
            />
          ) : null}

          <ol className={styles.archSteps} aria-label="Layers">
            {layers.map((layer, i) => {
              const state = i === active ? "active" : i < active ? "passed" : "next";
              const y =
                state === "active"
                  ? CENTER_Y
                  : state === "passed"
                    ? 80 + i * STEP_PITCH
                    : 846 - (n - 1 - i) * STEP_PITCH;
              return (
                <li
                  key={layer.key}
                  className={styles.archStep}
                  data-state={state}
                  style={{ transform: `translateY(${at(y)})`, ["--step-accent" as string]: ACCENTS[i] }}
                  aria-current={state === "active" ? "step" : undefined}
                >
                  <span className={styles.archMarker} aria-hidden="true" />
                  <span className={styles.archStepLabel}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    {layer.name.toUpperCase()}
                  </span>
                </li>
              );
            })}
          </ol>

          <AnimatePresence initial={false}>
            {intro ? (
              <motion.div
                key="intro"
                className={styles.archIntro}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.42, ease: EASE } }}
                exit={{ opacity: 0, y: -10, transition: { duration: 0.18 } }}
              >
                <h2 id="architecture-title" className={styles.h2}>
                  {title[0]} <em>{title[1]}</em>
                </h2>
                <p>{body}</p>
              </motion.div>
            ) : (
              <motion.div
                key={layers[active].key}
                className={styles.archPanel}
                style={{ ["--panel-top" as string]: at(CENTER_Y + 30) }}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.42, ease: EASE } }}
                exit={{ opacity: 0, y: -10, transition: { duration: 0.18 } }}
              >
                <h3 className={styles.archTitle}>{layers[active].title}</h3>
                <p>{layers[active].body}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className={styles.archVisual}>
          <svg
            className={styles.archSvg}
            viewBox="-350 -480 700 940"
            preserveAspectRatio="xMidYMin meet"
            role="img"
            aria-label={
              active >= 0
                ? `Architecture stack, ${n} layers. ${layers[active].name}: ${layers[active].body}`
                : `Architecture stack, ${n} layers.`
            }
          >
            {/* Bottom layer first so the upper plates paint over it. */}
            {layers
              .map((layer, i) => ({ layer, i }))
              .reverse()
              .map(({ layer, i }) => (
                <g key={layer.key} transform={`translate(0 ${plateY(i)})`}>
                  <Plate kind={layer.key} lit={i === active} />
                </g>
              ))}
            {settled ? (
              <g transform={`translate(0 ${plateY(active)})`}>
                <Callouts
                  key={layers[active].key}
                  kind={layers[active].key}
                  labels={layers[active].callouts}
                  accent={ACCENTS[active]}
                />
              </g>
            ) : null}
          </svg>
        </div>
      </div>
    </div>
  );
}

const top = (x: number, y: number): V3 => add(ORIGIN, [x, y, T]);
/** A point standing z above the plate surface. */
const raised = (x: number, y: number, z: number): V3 => add(top(x, y), [0, 0, z]);

function Plate({ kind, lit }: { kind: Layer["key"]; lit: boolean }) {
  const c = (x: number, y: number, z: number): V3 => add(ORIGIN, [x, y, z]);
  return (
    <g className={styles.plate} data-lit={lit}>
      <polygon className={styles.plateSide} points={pts([c(S, 0, 0), c(S, S, 0), c(S, S, T), c(S, 0, T)])} />
      <polygon className={styles.plateSide} points={pts([c(0, S, 0), c(S, S, 0), c(S, S, T), c(0, S, T)])} />
      <polygon className={styles.plateTop} points={pts([c(0, 0, T), c(S, 0, T), c(S, S, T), c(0, S, T)])} />
      <g transform={plane(top(0, 0), [S, 0, 0], [0, S, 0], 100, 100)}>
        <Drawing kind={kind} />
      </g>
      <Objects kind={kind} />
    </g>
  );
}

// ── Raised objects on each plate (plate-local world units, origin at the plate's top corner) ──

/** An extruded block with a soft contact shadow, a bevelled top and optional front detail. */
function Block({
  x,
  y,
  w,
  d,
  h,
  z = 0,
  tone = "dark",
  front,
  ghost,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  z?: number;
  tone?: "dark" | "light";
  front?: "bays" | "ports" | "keys";
  /** Dashed outline, for parts that are still in review. */
  ghost?: boolean;
}) {
  const c = (dx: number, dy: number, dz: number) => raised(x + dx, y + dy, z + dz);
  const reach = Math.min(18, h * 0.45 + 4);
  const inset = Math.min(4, w * 0.12, d * 0.12);
  return (
    <g className={styles.block} data-tone={tone} data-ghost={ghost}>
      {z === 0 ? (
        <polygon
          className={styles.blockShadow}
          points={pts([c(0, d, 0), c(w, d, 0), c(w + reach, d, 0), c(w + reach, reach * 0.4, 0), c(w, 0, 0)])}
        />
      ) : null}
      <polygon className={styles.blockSide} points={pts([c(w, 0, 0), c(w, d, 0), c(w, d, h), c(w, 0, h)])} />
      <polygon className={styles.blockFront} points={pts([c(0, d, 0), c(w, d, 0), c(w, d, h), c(0, d, h)])} />
      <polygon className={styles.blockTop} points={pts([c(0, 0, h), c(w, 0, h), c(w, d, h), c(0, d, h)])} />
      <polygon
        className={styles.blockBevel}
        points={pts([c(inset, inset, h), c(w - inset, inset, h), c(w - inset, d - inset, h), c(inset, d - inset, h)])}
      />
      {front === "bays"
        ? Array.from({ length: Math.max(2, Math.floor(h / 9)) }, (_, k) => {
            const zz = h - 6 - k * 9;
            return (
              <g key={k}>
                <polyline className={styles.blockDetail} points={pts([c(5, d, zz), c(w - 12, d, zz)])} />
                <polyline className={styles.blockLed} points={pts([c(w - 7, d, zz), c(w - 5, d, zz)])} />
              </g>
            );
          })
        : null}
      {front === "ports"
        ? Array.from({ length: 4 }, (_, k) => (
            <polyline key={k} className={styles.blockDetail} points={pts([c(6 + k * 12, d, h * 0.5), c(12 + k * 12, d, h * 0.5)])} />
          ))
        : null}
      {front === "keys"
        ? Array.from({ length: 3 }, (_, r) => (
            <polyline
              key={r}
              className={styles.blockDetail}
              points={pts([c(inset + 4, inset + 8 + r * 10, h), c(w - inset - 4, inset + 8 + r * 10, h)])}
            />
          ))
        : null}
    </g>
  );
}

/** A stack of coins: short isometric cylinders with a ridge on each rim. */
function Coins({ x, y, count, r = 17 }: { x: number; y: number; count: number; r?: number }) {
  const rx = r * Math.SQRT2 * COS;
  const ry = r * Math.SQRT2 * SIN;
  const thick = 5;
  const [bx, by] = iso(raised(x, y, 0));
  return (
    <g className={styles.coins}>
      <ellipse className={styles.blockShadow} cx={bx + 10} cy={by + 4} rx={rx * 1.1} ry={ry * 1.1} />
      {Array.from({ length: count }, (_, k) => {
        const [cx, cy] = iso(raised(x, y, k * thick));
        return (
          <g key={k}>
            <ellipse className={styles.coinSide} cx={cx} cy={cy} rx={rx} ry={ry} />
            <rect className={styles.coinBand} x={cx - rx} y={cy - thick} width={rx * 2} height={thick} />
            <ellipse className={styles.coinTop} cx={cx} cy={cy - thick} rx={rx} ry={ry} />
            {k === count - 1 ? (
              <ellipse className={styles.coinRidge} cx={cx} cy={cy - thick} rx={rx * 0.7} ry={ry * 0.7} />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

/** A line between two raised points on the plate. */
function Wire({ a, b, live }: { a: V3; b: V3; live?: boolean }) {
  return <polyline className={live ? styles.wireLive : styles.wire} points={pts([raised(...a), raised(...b)])} />;
}

/** A trace printed flat on the plate, through plate-local points. */
function Trace({ points, live }: { points: ReadonlyArray<[number, number]>; live?: boolean }) {
  return <polyline className={live ? styles.traceLive : styles.trace} points={pts(points.map(([x, y]) => raised(x, y, 0)))} />;
}

/** A device from the hero, standing on a node box. */
function DeviceOn({ kind, x, y, scale = 0.72 }: { kind: Kind; x: number; y: number; scale?: number }) {
  const Draw = DRAW[kind];
  const [px, py] = iso(raised(x, y, 16));
  return (
    <g transform={`translate(${px} ${py}) scale(${scale})`}>
      <Draw t={0} level={0.35} seed={x} />
    </g>
  );
}

const MESH_NODES: [Kind, number, number][] = [
  ["laptop", 58, 58],
  ["pi", 208, 52],
  ["crt", 134, 136],
  ["phone", 58, 214],
  ["mini", 212, 210],
];

/** Where each callout points, in the same order as the layer's labels (plate-local world points). */
const ANCHORS: Record<Layer["key"], V3[]> = {
  app: [raised(118, 52, 30), raised(207, 40, 22), raised(160, 128, 20), raised(125, 220, 30)],
  coordinator: [raised(58, 60, 76), raised(205, 60, 4), raised(160, 220, 40), raised(200, 150, 30)],
  payments: [raised(100, 110, 52), raised(196, 62, 20), raised(205, 150, 12)],
  mesh: [
    raised(58, 58, 60),
    raised(208, 52, 30),
    raised(134, 136, 75),
    raised(58, 214, 22),
    raised(212, 210, 30),
    raised(133, 55, 18),
  ],
  provenance: [raised(171, 53, 48), raised(146, 130, 26), raised(54, 76, 18), raised(60, 245, 0)],
};

function Objects({ kind }: { kind: Layer["key"] }) {
  switch (kind) {
    case "app":
      // A console on a raised bezel with stepped panels, and a separate API terminal.
      return (
        <>
          <Block x={66} y={18} w={194} d={160} h={8} />
          <Block x={78} y={30} w={80} d={46} h={20} z={8} tone="light" />
          <Block x={168} y={30} w={80} d={22} h={12} z={8} />
          <Block x={168} y={60} w={36} d={22} h={16} z={8} />
          <Block x={78} y={88} w={170} d={78} h={10} z={8} front="keys" />
          <Block x={70} y={194} w={110} d={58} h={26} front="ports" />
        </>
      );
    case "coordinator":
      // A coordinator tower with drive bays, feeding three circuit fragments on a planning rail.
      return (
        <>
          <Block x={24} y={30} w={70} d={58} h={76} front="bays" />
          <Block x={150} y={40} w={104} d={40} h={4} />
          <Wire a={[94, 60, 46]} b={[140, 150, 34]} live />
          <Wire a={[94, 60, 46]} b={[200, 150, 28]} live />
          <Wire a={[94, 60, 46]} b={[160, 220, 40]} live />
          <Block x={120} y={130} w={40} d={40} h={34} tone="light" />
          <Block x={180} y={130} w={40} d={40} h={28} tone="light" />
          <Block x={140} y={200} w={40} d={40} h={40} tone="light" />
        </>
      );
    case "payments":
      // Coin stacks beside a raised receipt and a registry drawer.
      return (
        <>
          <Coins x={60} y={70} count={8} />
          <Block x={150} y={36} w={96} d={60} h={10} />
          <Block x={160} y={44} w={74} d={26} h={6} z={10} tone="light" />
          <Block x={150} y={120} w={96} d={64} h={14} front="bays" />
          <Coins x={100} y={110} count={11} />
          <Coins x={60} y={152} count={5} />
          <Coins x={110} y={198} count={7} />
        </>
      );
    case "mesh":
      // Node boxes with the hero's devices on them, linked peer to peer.
      return (
        <>
          {MESH_NODES.map(([, x, y], i) =>
            MESH_NODES.slice(i + 1).map(([, x2, y2], j) => (
              <Wire key={`${i}-${j}`} a={[x, y, 16]} b={[x2, y2, 16]} live />
            )),
          )}
          {MESH_NODES.map(([k, x, y]) => (
            <g key={k}>
              <Block x={x - 32} y={y - 32} w={64} d={64} h={16} front="ports" />
              <DeviceOn kind={k} x={x} y={y} />
            </g>
          ))}
        </>
      );
    case "provenance": {
      // Bundles → Merkle tree → anchor chain, connected by traces printed flat on the plate.
      const leaves = [120, 150, 180, 210];
      return (
        <>
          {/* Traces first, so the blocks sit on top of them. */}
          <Trace points={[[54, 112], [54, 205], [109, 205]]} live />
          <Trace points={[[131, 194], [131, 141], [135, 141]]} />
          <Trace points={[[161, 194], [161, 152]]} />
          <Trace points={[[191, 194], [191, 152]]} />
          <Trace points={[[221, 194], [221, 141], [217, 141]]} />
          <Trace points={[[146, 119], [146, 92], [165, 92], [165, 79]]} />
          <Trace points={[[206, 119], [206, 92], [176, 92], [176, 79]]} />
          <Trace points={[[188, 56], [218, 56]]} live />
          {/* Result bundles: a stack of sheets. */}
          {[0, 5, 10, 15].map((z) => (
            <Block key={z} x={24} y={40} w={60} d={72} h={3} z={z} tone={z === 15 ? "light" : "dark"} />
          ))}
          {/* Anchor chain on Sepolia, still in review. */}
          {[22, 56, 90].map((y) => (
            <Block key={y} x={218} y={y} w={26} d={26} h={14} ghost />
          ))}
          {/* Merkle tree: root tallest, at the back. */}
          <Block x={154} y={36} w={34} d={34} h={48} tone="light" />
          <Block x={135} y={119} w={22} d={22} h={26} />
          <Block x={195} y={119} w={22} d={22} h={26} />
          {leaves.map((x) => (
            <Block key={x} x={x - 11} y={194} w={22} d={22} h={10} />
          ))}
        </>
      );
    }
  }
}

/** Griffin-style plate art, drawn flat on 100×100 and mapped onto the plate: black panels, hairlines, bars. */
function Drawing({ kind }: { kind: Layer["key"] }) {
  const ink = { className: styles.plateInk, vectorEffect: "non-scaling-stroke" as const };
  const bar = { className: styles.plateBar };
  const hatch = (x: number, y: number, w: number, h: number, step = 2.2) =>
    Array.from({ length: Math.floor(w / step) }, (_, k) => (
      <line key={`h${x}-${k}`} {...ink} x1={x + k * step} y1={y} x2={x + k * step} y2={y + h} />
    ));
  const label = (text: string, x: number, y: number) => (
    <text className={styles.plateText} x={x} y={y}>
      {text}
    </text>
  );
  switch (kind) {
    case "app":
      return (
        <>
          <rect {...ink} x={4} y={4} width={92} height={92} />
          {hatch(8, 8, 14, 84)}
          {label("QMESH:CONSOLE", 60, 94)}
        </>
      );
    case "coordinator":
      return (
        <>
          {label("PLAN:QASM", 8, 12)}
          {[60, 68, 82, 90].map((y, k) => (
            <rect key={y} {...bar} x={6 + k * 3} y={y} width={[34, 40, 22, 30][k]} height={3.2} rx={1.6} />
          ))}
          {[44, 66].map((x) => (
            <line key={x} {...ink} className={styles.plateCut} x1={x} y1={44} x2={x} y2={96} />
          ))}
        </>
      );
    case "payments":
      return (
        <>
          <rect {...ink} x={4} y={4} width={92} height={92} />
          {Array.from({ length: 34 }, (_, k) => (
            <rect
              key={k}
              {...bar}
              x={52 + k * 1.2}
              y={k % 3 === 0 ? 78 : 81}
              width={k % 4 === 0 ? 0.9 : 0.5}
              height={k % 3 === 0 ? 12 : 9}
            />
          ))}
          {label("X402:USDC", 8, 94)}
        </>
      );
    case "mesh":
      return (
        <>
          {Array.from({ length: 5 }, (_, r) =>
            Array.from({ length: 5 }, (_, k) => (
              <text key={`${r}-${k}`} className={styles.plateCross} x={8 + k * 21} y={10 + r * 21}>
                +
              </text>
            )),
          )}
          {label("PEER:MESH", 8, 97)}
        </>
      );
    case "provenance":
      return (
        <>
          {Array.from({ length: 40 }, (_, k) => (
            <rect
              key={k}
              {...bar}
              x={8 + k * 2}
              y={k % 5 === 0 ? 84 : 86}
              width={k % 3 === 0 ? 1.4 : 0.7}
              height={k % 5 === 0 ? 10 : 8}
            />
          ))}
          {label("IPFS:CID", 8, 80)}
        </>
      );
  }
}

/**
 * One label per component, Griffin style: dot, mono label, a diagonal leader, then a
 * vertical drop to the component. Labels stack in columns either side, ordered so that
 * no two leaders cross.
 */
function Callouts({ kind, labels, accent }: { kind: Layer["key"]; labels: readonly string[]; accent: string }) {
  const anchors = ANCHORS[kind].map((p) => iso(p));
  const items = labels.map((label, k) => ({ label, at: anchors[k] ?? anchors[0] }));
  const left = items.filter((it) => it.at[0] < 0).sort((a, b) => b.at[0] - a.at[0]);
  const right = items.filter((it) => it.at[0] >= 0).sort((a, b) => a.at[0] - b.at[0]);
  const ROW = 44;
  const TOP = -300;
  const lineOf = (label: string) => {
    const words = label.toUpperCase().split(" ");
    if (label.length <= 14 || words.length === 1) return [label.toUpperCase()];
    const cut = Math.ceil(words.length / 2);
    return [words.slice(0, cut).join(" "), words.slice(cut).join(" ")];
  };
  const place = (list: typeof items, side: "left" | "right") =>
    list.map((it, row) => {
      const lines = lineOf(it.label);
      const textW = Math.max(...lines.map((l) => l.length)) * 8.6;
      const ly = TOP + row * ROW;
      const lx = side === "left" ? -338 : 338 - textW - 18;
      const startX = side === "left" ? lx + 18 + textW + 8 : lx - 8;
      const kneeY = Math.min(ly + 26, it.at[1] - 10);
      return { ...it, lines, lx, ly, startX, kneeY };
    });
  const placed = [...place(left, "left"), ...place(right, "right")];
  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: EASE }}
      style={{ ["--step-accent" as string]: accent }}
    >
      {placed.map(({ label, lines, lx, ly, startX, kneeY, at: [ax, ay] }) => (
        <g key={label}>
          <polyline className={styles.calloutLine} points={`${startX},${ly - 4} ${ax},${kneeY} ${ax},${ay}`} />
          <circle className={styles.calloutAnchor} cx={ax} cy={ay} r={2.5} />
          <circle className={styles.calloutDot} cx={lx + 4} cy={ly - 5} r={3.5} />
          <text className={styles.calloutText} x={lx + 18} y={ly}>
            {lines.map((line, j) => (
              <tspan key={line} x={lx + 18} dy={j === 0 ? 0 : 17}>
                {line}
              </tspan>
            ))}
          </text>
        </g>
      ))}
    </motion.g>
  );
}
