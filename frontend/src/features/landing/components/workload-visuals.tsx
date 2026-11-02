import type { Workload } from "../landing-content";
import styles from "../landing.module.css";

/** Small animated line diagrams, one per workload, drawn in the page's hairline style. */
export function WorkloadVisual({ kind }: { kind: Workload["visual"] }) {
  return (
    <svg className={styles.wlVisual} viewBox="0 0 400 240" role="img" aria-label={LABELS[kind]}>
      {DRAW[kind]}
    </svg>
  );
}

const LABELS: Record<Workload["visual"], string> = {
  circuit: "A circuit on three wires, cut into fragments that travel to three devices",
  frontier: "Risk and return of candidate portfolios, with the efficient frontier drawn through them",
  histogram: "A distribution of simulated losses, with the value-at-risk threshold marked",
  chain: "Result bundles hashed into a Merkle tree whose root links to a chain of blocks",
  molecule: "A molecule graph beside an energy curve settling to its minimum",
};

const wires = [70, 120, 170];
/** Round computed coordinates so the server and browser render identical markup. */
const r1 = (n: number) => Math.round(n * 10) / 10;

const DRAW: Record<Workload["visual"], React.ReactNode> = {
  circuit: (
    <g>
      {wires.map((y) => (
        <line key={y} className={styles.wlLine} x1={20} y1={y} x2={250} y2={y} />
      ))}
      {[
        [50, 70, "H"],
        [110, 120, "X"],
        [170, 70, "Z"],
        [200, 170, "H"],
      ].map(([x, y, g]) => (
        <g key={`${x}-${y}`}>
          <rect className={styles.wlGate} x={Number(x) - 12} y={Number(y) - 12} width={24} height={24} />
          <text className={styles.wlText} x={Number(x)} y={Number(y) + 4} textAnchor="middle">
            {g}
          </text>
        </g>
      ))}
      <line className={styles.wlLine} x1={80} y1={70} x2={80} y2={120} />
      <circle className={styles.wlDot} cx={80} cy={70} r={4} />
      <line className={styles.wlLine} x1={140} y1={120} x2={140} y2={170} />
      <circle className={styles.wlDot} cx={140} cy={120} r={4} />
      {[95, 155].map((x) => (
        <line key={x} className={styles.wlCut} x1={x} y1={50} x2={x} y2={190} />
      ))}
      {[0, 1, 2].map((k) => (
        <g key={k}>
          <rect className={styles.wlDevice} x={300} y={44 + k * 60} width={70} height={40} rx={4} />
          <path className={styles.wlFlow} d={`M 250 ${wires[k]} C 275 ${wires[k]}, 280 ${64 + k * 60}, 300 ${64 + k * 60}`} />
          <rect className={styles.wlPacket} x={-4} y={-4} width={8} height={8} style={{ animationDelay: `${k * 0.5}s` }}>
            <animateMotion
              dur="2.4s"
              begin={`${k * 0.5}s`}
              repeatCount="indefinite"
              path={`M 250 ${wires[k]} C 275 ${wires[k]}, 280 ${64 + k * 60}, 300 ${64 + k * 60}`}
            />
          </rect>
        </g>
      ))}
    </g>
  ),
  frontier: (
    <g>
      <line className={styles.wlAxis} x1={40} y1={210} x2={380} y2={210} />
      <line className={styles.wlAxis} x1={40} y1={210} x2={40} y2={20} />
      <text className={styles.wlLabel} x={380} y={228} textAnchor="end">
        RISK
      </text>
      <text className={styles.wlLabel} x={46} y={26}>
        RETURN
      </text>
      {Array.from({ length: 46 }, (_, i) => {
        const x = 70 + ((i * 53) % 290);
        const y = r1(190 - ((i * 37) % 120) - (x - 70) * 0.08);
        return <circle key={i} className={styles.wlPoint} cx={x} cy={y} r={2} style={{ animationDelay: `${(i % 9) * 0.12}s` }} />;
      })}
      <path className={styles.wlDraw} d="M 70 190 C 110 110, 190 64, 360 44" />
      <circle className={styles.wlPick} cx={196} cy={74} r={6} />
    </g>
  ),
  histogram: (
    <g>
      <line className={styles.wlAxis} x1={30} y1={210} x2={380} y2={210} />
      {Array.from({ length: 24 }, (_, i) => {
        const h = r1(150 * Math.exp(-((i - 11) ** 2) / 26) + 6);
        return (
          <rect
            key={i}
            className={i < 4 ? styles.wlBarTail : styles.wlBar}
            x={40 + i * 14}
            y={r1(210 - h)}
            width={10}
            height={h}
            style={{ animationDelay: `${i * 0.04}s` }}
          />
        );
      })}
      <line className={styles.wlCut} x1={96} y1={30} x2={96} y2={210} />
      <text className={styles.wlLabel} x={102} y={40}>
        VAR 95%
      </text>
    </g>
  ),
  chain: (
    <g>
      {[60, 130, 200, 270].map((x, i) => (
        <g key={x}>
          <rect className={styles.wlGate} x={x - 22} y={170} width={44} height={28} />
          <line className={styles.wlLine} x1={x} y1={170} x2={i < 2 ? 95 : 235} y2={128} />
        </g>
      ))}
      {[95, 235].map((x) => (
        <g key={x}>
          <rect className={styles.wlGate} x={x - 22} y={100} width={44} height={28} />
          <line className={styles.wlLine} x1={x} y1={100} x2={165} y2={58} />
        </g>
      ))}
      <rect className={styles.wlRoot} x={143} y={30} width={44} height={28} />
      <path className={styles.wlDraw} d="M 187 44 L 300 44" />
      {[300, 340].map((x) => (
        <rect key={x} className={styles.wlDevice} x={x} y={30} width={32} height={28} />
      ))}
      <text className={styles.wlLabel} x={165} y={22} textAnchor="middle">
        ROOT
      </text>
      <text className={styles.wlLabel} x={340} y={78} textAnchor="middle">
        SEPOLIA · IN REVIEW
      </text>
    </g>
  ),
  molecule: (
    <g>
      {[
        [60, 80, 100, 60],
        [100, 60, 140, 80],
        [140, 80, 140, 125],
        [140, 125, 100, 145],
        [100, 145, 60, 125],
        [60, 125, 60, 80],
        [140, 80, 180, 60],
        [100, 145, 100, 185],
      ].map(([a, b, c, d], i) => (
        <line key={i} className={styles.wlLine} x1={a} y1={b} x2={c} y2={d} />
      ))}
      {[
        [60, 80],
        [100, 60],
        [140, 80],
        [140, 125],
        [100, 145],
        [60, 125],
        [180, 60],
        [100, 185],
      ].map(([x, y], i) => (
        <circle key={i} className={styles.wlAtom} cx={x} cy={y} r={i > 5 ? 7 : 5} style={{ animationDelay: `${i * 0.2}s` }} />
      ))}
      <line className={styles.wlAxis} x1={230} y1={200} x2={385} y2={200} />
      <text className={styles.wlLabel} x={385} y={218} textAnchor="end">
        ITERATION
      </text>
      <text className={styles.wlLabel} x={232} y={36}>
        ENERGY
      </text>
      <path className={styles.wlDraw} d="M 235 50 C 270 150, 300 170, 380 176" />
    </g>
  ),
};
