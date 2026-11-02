import styles from "../landing.module.css";

// ── Isometric projection ──
export type V3 = readonly [number, number, number];
export const COS = Math.cos(Math.PI / 6);
export const SIN = 0.5;
export const iso = ([x, y, z]: V3): [number, number] => [(x - y) * COS, (x + y) * SIN - z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const lerp3 = (a: V3, b: V3, f: number): V3 => [
  a[0] + (b[0] - a[0]) * f,
  a[1] + (b[1] - a[1]) * f,
  a[2] + (b[2] - a[2]) * f,
];
export const pts = (list: V3[]) => list.map((p) => iso(p).map((n) => n.toFixed(1)).join(",")).join(" ");
/** SVG matrix mapping a flat w×h drawing onto the 3D parallelogram (o, o+u, o+v). */
export const plane = (o: V3, u: V3, v: V3, w: number, h: number) => {
  const [ox, oy] = iso(o);
  const [ux, uy] = iso(add(o, u));
  const [vx, vy] = iso(add(o, v));
  return `matrix(${(ux - ox) / w} ${(uy - oy) / w} ${(vx - ox) / h} ${(vy - oy) / h} ${ox} ${oy})`;
};
/** World point on the ground for a screen-space position, so the layout is planned on screen. */
export const ground = (X: number, Y: number): V3 => [(X / COS + Y / SIN) / 2, (Y / SIN - X / COS) / 2, 0];
export const clamp = (n: number) => Math.min(1, Math.max(0, n));
export const ease = (n: number) => 1 - Math.pow(1 - clamp(n), 3);

// ── Shared drawing primitives ──

export function Box({ o, w, d, h, topClass }: { o: V3; w: number; d: number; h: number; topClass?: string }) {
  const c = (x: number, y: number, z: number) => add(o, [x, y, z]);
  return (
    <>
      <polygon className={styles.isoFront} points={pts([c(0, d, 0), c(w, d, 0), c(w, d, h), c(0, d, h)])} />
      <polygon className={styles.isoSide} points={pts([c(w, 0, 0), c(w, d, 0), c(w, d, h), c(w, 0, h)])} />
      <polygon className={topClass ?? styles.isoTop} points={pts([c(0, 0, h), c(w, 0, h), c(w, d, h), c(0, d, h)])} />
    </>
  );
}

export function Led({ at, on }: { at: V3; on: boolean }) {
  const [x, y] = iso(at);
  return <circle className={on ? styles.isoLedOn : styles.isoLed} cx={x} cy={y} r={1.8} />;
}

