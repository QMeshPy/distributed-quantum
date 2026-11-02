import styles from "../landing.module.css";

// 5x5 pixel mark: a coordinator with four peers on its diagonals.
const CELLS: ReadonlyArray<[number, number, "core" | "peer"]> = [
  [0, 0, "peer"], [4, 0, "peer"], [1, 1, "peer"], [3, 1, "peer"], [2, 2, "core"],
  [1, 3, "peer"], [3, 3, "peer"], [0, 4, "peer"], [4, 4, "peer"],
];

/** QMesh pixel mark. */
export function MeshMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 5 5" className={className} aria-hidden="true" shapeRendering="crispEdges">
      {CELLS.map(([x, y, kind]) => (
        <rect
          key={`${x}${y}`}
          x={x + 0.08}
          y={y + 0.08}
          width={0.84}
          height={0.84}
          className={kind === "core" ? styles.markCore : styles.markPeer}
        />
      ))}
    </svg>
  );
}

/** 5x5 mirrored pixel identicon derived from a name, in the page's two signals. */
export function Identicon({ seed }: { seed: string }) {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const tone = hash & 1 ? styles.markPeer : styles.markCore;
  const cells: Array<[number, number]> = [];
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if ((hash >>> (row * 3 + col)) & 1) {
        cells.push([col, row]);
        if (col < 2) cells.push([4 - col, row]);
      }
    }
  }
  return (
    <svg viewBox="0 0 5 5" className={styles.identicon} aria-hidden="true" shapeRendering="crispEdges">
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x + 0.06} y={y + 0.06} width={0.88} height={0.88} className={tone} />
      ))}
    </svg>
  );
}
