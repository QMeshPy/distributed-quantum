"use client";

import { useEffect, useRef, useState } from "react";

import styles from "../landing.module.css";
import { DRAW } from "./devices";
import { add, clamp, COS, ease, iso, lerp3, plane, pts, SIN, type V3 } from "./iso";
import { hash } from "./pixel-canvas";
import { LAND, MAP_COLS, MAP_ROWS, toCell } from "./world-map";

/** A circle of radius r lying on the map, as an ellipse's radii. */
const flat = (r: number) => ({ rx: r * Math.SQRT2 * COS, ry: r * Math.SQRT2 * SIN });

// ── The world map slab ──
const CELL = 5.4; // world units per 3.75° map cell
const MAP_W = MAP_COLS * CELL;
const MAP_D = MAP_ROWS * CELL;
const MAP_T = 10;
const MAP_ORIGIN: V3 = [-MAP_W / 2, -MAP_D / 2, 0];
/** A longitude/latitude on the slab's surface. */
const onMap = (lon: number, lat: number): V3 => {
  const [c, r] = toCell(lon, lat);
  return add(MAP_ORIGIN, [c * CELL, r * CELL, MAP_T]);
};

// ── The mesh: whatever hardware is lying around, wherever it is ──
type Kind = keyof typeof DRAW;
interface Device {
  kind: Kind;
  name: string;
  city: string;
  height: number;
  at: V3;
}
const SCALE = 0.62; // devices are drawn smaller over the map
// Ordered so the ring of links travels around the globe.
const SLOTS: [Kind, string, string, number, number, number][] = [
  ["laptop", "Laptop", "San Francisco", 64, -122.4, 37.8],
  ["phone", "Old Android phone", "São Paulo", 8, -46.6, -23.5],
  ["cluster", "Raspberry Pi cluster", "Cape Town", 50, 18.4, -33.9],
  ["crt", "Old desktop", "London", 70, -0.1, 51.5],
  ["pi", "Raspberry Pi", "Mumbai", 16, 72.9, 19.1],
  ["mini", "Mini PC", "Tokyo", 14, 139.7, 35.7],
];
const DEVICES: Device[] = SLOTS.map(([kind, name, city, height, lon, lat]) => ({
  kind,
  name,
  city,
  height: height * SCALE,
  at: onMap(lon, lat),
}));
const ORDER = DEVICES.map((_, i) => i).sort((a, b) => iso(DEVICES[a].at)[1] - iso(DEVICES[b].at)[1]);
// The laptop in San Francisco submits the job: fragments leave it and bits return to it.
const HOME = 0;
/** Each peer hovers over its city at its own height and bobs gently. */
const floatOf = (i: number, now: number) => 34 + (i % 3) * 10 + Math.sin(now * 1.1 + i * 1.7) * 4;

/** The slab and its dotted continents. Built once: it never changes. */
const MAP_SLAB = (() => {
  const c = (x: number, y: number, z: number) => add(MAP_ORIGIN, [x, y, z]);
  const dots = [];
  for (let r = 0; r < MAP_ROWS; r += 1) {
    for (let k = 0; k < MAP_COLS; k += 1) {
      if (LAND[r][k] === "#") {
        dots.push(<circle key={`${r}-${k}`} className={styles.mapDot} cx={k + 0.5} cy={r + 0.5} r={0.26} />);
      }
    }
  }
  return (
    <g aria-hidden="true">
      <polygon className={styles.mapSide} points={pts([c(MAP_W, 0, 0), c(MAP_W, MAP_D, 0), c(MAP_W, MAP_D, MAP_T), c(MAP_W, 0, MAP_T)])} />
      <polygon className={styles.mapSide} points={pts([c(0, MAP_D, 0), c(MAP_W, MAP_D, 0), c(MAP_W, MAP_D, MAP_T), c(0, MAP_D, MAP_T)])} />
      <polygon className={styles.mapTop} points={pts([c(0, 0, MAP_T), c(MAP_W, 0, MAP_T), c(MAP_W, MAP_D, MAP_T), c(0, MAP_D, MAP_T)])} />
      <g transform={plane(c(0, 0, MAP_T), [MAP_W, 0, 0], [0, MAP_D, 0], MAP_COLS, MAP_ROWS)}>
        {[11, 22, 33].map((y) => (
          <line key={`lat${y}`} className={styles.mapGrid} x1={0} x2={MAP_COLS} y1={y} y2={y} vectorEffect="non-scaling-stroke" />
        ))}
        {[24, 48, 72].map((x) => (
          <line key={`lon${x}`} className={styles.mapGrid} x1={x} x2={x} y1={0} y2={MAP_ROWS} vectorEffect="non-scaling-stroke" />
        ))}
        {dots}
      </g>
    </g>
  );
})();

// ── Timeline: devices join once, then the run loops ──
const JOIN = 2.8;
const joinAt = (i: number) => 0.25 + i * 0.32;
const LOOP = 10;
const st = (i: number) => i * 0.12;
const ARRIVE = (i: number) => 1.2 + st(i);
const MEASURE = (i: number) => 4.6 + st(i) * 0.6;
const RETURNED = (i: number) => MEASURE(i) + 1.2;
const VERIFY = 7.5;

interface Clock {
  t: number; // time within the run loop
  join: number; // time since load, for the one-off join
  loop: number;
}

export function IsoMesh({ label, caption }: { label: string; caption: string }) {
  const [clock, setClock] = useState<Clock>({ t: VERIFY + 0.8, join: 99, loop: 0 });
  const [hovered, setHovered] = useState<number | null>(null);
  const start = useRef(0);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let previous = 0;
    let visible = true;
    start.current = performance.now();
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    if (ref.current) observer.observe(ref.current);
    const tick = (ms: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible || ms - previous < 1000 / 30) return;
      previous = ms;
      const elapsed = (ms - start.current) / 1000;
      const run = Math.max(0, elapsed - JOIN);
      setClock({ t: elapsed < JOIN ? 0 : run % LOOP, join: elapsed, loop: Math.floor(run / LOOP) });
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  const restart = () => {
    start.current = performance.now() - JOIN * 1000;
  };

  const { t, join, loop } = clock;
  const joining = join < JOIN;
  const bits = DEVICES.map((_, i) => (hash(loop * 17 + i, 3) > 0.5 ? 1 : 0));
  const entangle = joining ? 0 : clamp((t - 3.0) / 0.4) * clamp((4.6 - t) / 0.3);

  return (
    <figure ref={ref} className={styles.isoStage}>
      <svg className={styles.isoSvg} viewBox="-372 -225 744 440" role="img" aria-label={label} onClick={restart}>
        {MAP_SLAB}
        <Pins now={join} joining={joining} />
        <Links t={t} joining={joining} entangle={entangle} />
        {ORDER.map((i) => (
          <DeviceView
            key={DEVICES[i].name}
            index={i}
            t={t}
            join={join}
            joining={joining}
            bit={bits[i]}
            lifted={hovered === i}
            onHover={setHovered}
          />
        ))}
        <Readout t={t} joining={joining} bits={bits} />
        {hovered !== null ? <Tag index={hovered} t={t} joining={joining} /> : null}
      </svg>
      <figcaption className={styles.isoCaption}>{caption}</figcaption>
    </figure>
  );
}

// ── Links and packets ──

const N = DEVICES.length;
/** Peer-to-peer link between neighbours: a raised arc over the map, like a flight path. */
const linkMid = (i: number, j: number): V3 => {
  const a = DEVICES[i].at;
  const b = DEVICES[j].at;
  const span = Math.hypot(a[0] - b[0], a[1] - b[1]);
  return add(lerp3(a, b, 0.5), [0, 0, 30 + span * 0.22]);
};
const onLink = (i: number, j: number, f: number): V3 =>
  lerp3(lerp3(DEVICES[i].at, linkMid(i, j), f), lerp3(linkMid(i, j), DEVICES[j].at, f), f);
const linkPath = (i: number, j: number) => {
  const [ax, ay] = iso(DEVICES[i].at);
  const [mx, my] = iso(linkMid(i, j));
  const [bx, by] = iso(DEVICES[j].at);
  return `M ${ax} ${ay} Q ${mx} ${my} ${bx} ${by}`;
};

/** Where each peer sits: a ring on the map and a dashed tether up to the device. */
function Pins({ now, joining }: { now: number; joining: boolean }) {
  return (
    <g aria-hidden="true">
      {DEVICES.map((d, i) => {
        const [gx, gy] = iso(d.at);
        const [, ty] = iso(add(d.at, [0, 0, floatOf(i, now)]));
        const shown = clamp((now - joinAt(i)) / 0.7);
        return (
          <g key={d.name} style={{ opacity: joining ? shown : 1 }}>
            <ellipse className={styles.mapPin} cx={gx} cy={gy} {...flat(11)} />
            <circle className={styles.mapPinDot} cx={gx} cy={gy} r={2} />
            <line className={styles.isoTether} x1={gx} y1={gy} x2={gx} y2={ty} />
          </g>
        );
      })}
    </g>
  );
}

function Links({ t, joining, entangle }: { t: number; joining: boolean; entangle: number }) {
  return (
    <g aria-hidden="true">
      {DEVICES.map((d, i) => (
        <path
          key={`ring-${d.name}`}
          className={styles.isoRing}
          style={{ opacity: 0.4 + entangle * 0.6 }}
          d={linkPath(i, (i + 1) % N)}
        />
      ))}
      {entangle > 0.05
        ? DEVICES.map((d, i) => {
            const [x, y] = iso(onLink(i, (i + 1) % N, (t * 0.8 + i * 0.21) % 1));
            return (
              <circle key={`e-${d.name}`} className={styles.isoPulse} cx={x} cy={y} r={3} style={{ opacity: entangle }} />
            );
          })
        : null}
      {/* Job routes: from the requesting laptop out to every other peer. */}
      {DEVICES.map((d, i) =>
        i === HOME ? null : (
          <path
            key={`route-${d.name}`}
            className={styles.isoArc}
            style={{ opacity: joining ? 0.12 : 0.45 }}
            d={linkPath(HOME, i)}
          />
        ),
      )}
      {joining
        ? null
        : DEVICES.map((d, i) => {
            if (i === HOME) return null;
            const out = t - (ARRIVE(i) - 0.9);
            const back = t - MEASURE(i) - 0.3;
            const outgoing = out > 0 && out < 0.9;
            const returning = back > 0 && back < 0.9;
            if (!outgoing && !returning) return null;
            const [x, y] = iso(onLink(HOME, i, outgoing ? ease(out / 0.9) : 1 - ease(back / 0.9)));
            return (
              <g key={`p-${d.name}`}>
                <circle className={outgoing ? styles.isoPacketGlow : styles.isoPacketGlowBack} cx={x} cy={y} r={9} />
                <rect
                  className={outgoing ? styles.isoPacket : styles.isoPacketBack}
                  x={x - 4}
                  y={y - 4}
                  width={8}
                  height={8}
                  transform={`rotate(45 ${x} ${y})`}
                />
              </g>
            );
          })}
    </g>
  );
}

function DeviceView({
  index,
  t,
  join,
  joining,
  bit,
  lifted,
  onHover,
}: {
  index: number;
  t: number;
  join: number;
  joining: boolean;
  bit: number;
  lifted: boolean;
  onHover: (index: number | null) => void;
}) {
  const device = DEVICES[index];
  const arrive = clamp((join - joinAt(index)) / 0.7);
  const drop = 80 * (1 - ease(arrive));
  const hover = floatOf(index, join);
  const [x, y] = iso(device.at);
  const computing = !joining && t >= ARRIVE(index) && t < MEASURE(index);
  const reporting = !joining && t >= MEASURE(index) && t < RETURNED(index);
  const level = computing ? 0.55 : reporting ? 0.2 : 0.08;
  const Draw = DRAW[device.kind];
  return (
    <g aria-hidden="true">
      <ellipse
        className={styles.isoShadow}
        cx={x}
        cy={y}
        {...flat(34)}
        style={{ opacity: clamp(arrive * 1.6) * 0.6 }}
      />
      {arrive > 0 && arrive < 1 ? (
        <ellipse
          className={styles.isoLand}
          cx={x}
          cy={y}
          {...flat(48 * arrive)}
          style={{ opacity: 1 - arrive }}
        />
      ) : null}
      <g
        className={styles.isoDevice}
        transform={`translate(${x} ${y - hover - drop - (lifted ? 8 : 0)}) scale(${SCALE})`}
        style={{ opacity: clamp(arrive * 1.6) }}
        onPointerEnter={() => onHover(index)}
        onPointerLeave={() => onHover(null)}
      >
        <Draw t={t + index} level={level} seed={index * 7} />
      </g>
      {arrive >= 1 ? (
        <Badge index={index} t={t} joining={joining} bit={bit} lift={hover + (lifted ? 8 : 0)} />
      ) : null}
    </g>
  );
}

/** A small qubit hovering over each device: superposition while computing, a bit once measured. */
function Badge({ index, t, joining, bit, lift }: { index: number; t: number; joining: boolean; bit: number; lift: number }) {
  const device = DEVICES[index];
  const [x, y] = iso(add(device.at, [0, 0, device.height + 22]));
  const arrived = !joining && t >= ARRIVE(index);
  const measured = !joining && t >= MEASURE(index);
  const r = 13;
  const theta =
    arrived && !measured
      ? Math.min(Math.PI * 0.55, (t - ARRIVE(index)) * 1.5) + Math.sin(t * 2 + index) * 0.25
      : measured
        ? bit
          ? Math.PI
          : 0
        : 0;
  const phi = t * 2.8 + index;
  const tipX = r * Math.sin(theta) * Math.cos(phi);
  const tipY = -r * Math.cos(theta) + r * 0.3 * Math.sin(theta) * Math.sin(phi);
  const flash = measured ? clamp(1 - (t - MEASURE(index)) / 0.6) : 0;
  return (
    <g transform={`translate(${x} ${y - lift})`}>
      <line className={styles.isoTether} x1={0} y1={r} x2={0} y2={22} />
      {flash > 0 ? <circle className={styles.isoBadgeFlash} r={r + 8 * (1 - flash)} style={{ opacity: flash }} /> : null}
      <circle className={styles.isoBadgeRing} r={r} />
      {measured ? (
        <text className={styles.isoBadgeBit} y={4.5}>
          {bit}
        </text>
      ) : (
        <>
          <ellipse className={styles.isoBadgeEq} rx={r} ry={r * 0.3} />
          <line className={styles.isoVector} x1={0} y1={0} x2={tipX} y2={tipY} />
          <circle className={styles.isoTip} cx={tipX} cy={tipY} r={2.2} />
        </>
      )}
    </g>
  );
}

// The readout is printed on the slab itself, in the empty South Pacific, so it lies flat in the map's orientation.
const ON_SLAB = plane(add(MAP_ORIGIN, [0, 0, MAP_T]), [MAP_W, 0, 0], [0, MAP_D, 0], MAP_COLS, MAP_ROWS);

/** The result as one machine: bits arrive from each peer, then the receipt. */
function Readout({ t, joining, bits }: { t: number; joining: boolean; bits: number[] }) {
  const live = !joining && t < LOOP - 0.4;
  const verified = live && t >= VERIFY;
  const home = DEVICES.map((_, i) => live && (i === HOME ? t >= MEASURE(i) : t >= RETURNED(i)));
  return (
    <g transform={ON_SLAB} aria-hidden="true">
      <g transform="translate(3 32.5)">
        <text className={styles.slabLabel}>ONE MACHINE</text>
        <text className={styles.slabBits} y={4.6}>
          {bits.map((b, i) => (home[i] ? b : "·")).join(" ")}
        </text>
        {verified ? (
          <g>
            <path className={styles.slabCheck} d="M 0 7.1 l 0.8 0.8 l 1.6 -1.8" vectorEffect="non-scaling-stroke" />
            <text className={styles.slabLabel} x={3.2} y={8}>
              RECEIPT · BUNDLE PINNED
            </text>
          </g>
        ) : null}
      </g>
    </g>
  );
}

function Tag({ index, t, joining }: { index: number; t: number; joining: boolean }) {
  const device = DEVICES[index];
  const [x, y] = iso(device.at);
  const state = joining || t < ARRIVE(index) ? "idle" : t < MEASURE(index) ? "running a fragment" : "result sent";
  const text = `${device.name} · ${device.city} · ${state}`;
  const width = text.length * 6.3 + 20;
  return (
    <g className={styles.isoTag} transform={`translate(${x} ${y + 30})`} aria-hidden="true">
      <rect x={-width / 2} y={-13} width={width} height={22} />
      <text y={2}>{text}</text>
    </g>
  );
}
