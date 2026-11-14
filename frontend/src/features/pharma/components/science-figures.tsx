"use client";

import {
  CartesianGrid,
  ComposedChart,
  ErrorBar,
  Line,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ADMETResult, VQEDescriptor } from "../types";
import type { ScorePoint } from "../types-live";
import { admetLoad, CHEMICAL_ACCURACY_HA, type EvaluatedMolecule } from "../lib/pharma-science";

// Validated with the dataviz palette script on #07090d (lightness, chroma, CVD, contrast all pass).
const C = {
  dg: "#10b981",
  homo: "#0284c7",
  lumo: "#d97706",
  pass: "#10b981",
  fail: "#e11d48",
  ink: "rgba(255,255,255,0.78)",
  muted: "rgba(255,255,255,0.38)",
  grid: "rgba(255,255,255,0.06)",
  surface: "#07090d",
};

const AXIS_TICK = { fontSize: 10, fill: C.muted, fontFamily: "var(--font-mono, ui-monospace)" };
const TOOLTIP_STYLE = {
  background: "#0d1017",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6,
  fontSize: 11,
  fontFamily: "ui-monospace, monospace",
};

/** Journal-style figure: bold panel letter, title, plot, caption. */
export function Figure({
  panel,
  title,
  caption,
  aside,
  children,
  className = "",
}: {
  panel: string;
  title: string;
  caption?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure className={`flex min-w-0 flex-col border border-white/[0.07] bg-white/[0.015] ${className}`}>
      <header className="flex items-baseline gap-2 border-b border-white/[0.05] px-3.5 py-2">
        <span className="font-serif text-[15px] font-bold leading-none text-white">{panel}</span>
        <h3 className="text-[11.5px] font-medium tracking-wide text-white/75">{title}</h3>
        {aside && <div className="ml-auto font-mono text-[10px] text-white/35">{aside}</div>}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
      {caption && (
        <figcaption className="border-t border-white/[0.04] px-3.5 py-2 text-[10.5px] leading-relaxed text-white/40">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full min-h-[160px] items-center justify-center px-4 text-center text-[11px] text-white/30">{children}</div>;
}

// ── ΔG convergence ────────────────────────────────────────────────────────────

/** ΔG per evaluated ligand with its 95% CI, plus the running minimum. */
export function ConvergencePlot({ molecules, fallback }: { molecules: EvaluatedMolecule[]; fallback: ScorePoint[] }) {
  const source = molecules.length
    ? molecules.map((m) => ({ dg: m.dg, err: [m.dg - m.ciLo, m.ciHi - m.dg] as [number, number], it: m.iteration }))
    : fallback.map((p) => ({ dg: p.score, err: [0, 0] as [number, number], it: p.iteration }));
  if (!source.length) return <Empty>ΔG appears after the first VQC scoring round</Empty>;

  const rows = source.map((r, i) => ({ n: i + 1, ...r, best: Math.min(...source.slice(0, i + 1).map((s) => s.dg)) }));

  return (
    <div className="h-[220px] px-1 pb-1 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 14, bottom: 14, left: 4 }}>
          <CartesianGrid stroke={C.grid} />
          <XAxis
            dataKey="n"
            type="number"
            domain={[0.5, rows.length + 0.5]}
            ticks={rows.map((r) => r.n)}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: C.grid }}
            label={{ value: "evaluation #", position: "insideBottom", offset: -8, fontSize: 10, fill: C.muted }}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: C.grid }}
            domain={["auto", "auto"]}
            width={46}
            label={{ value: "ΔG (kcal/mol)", angle: -90, position: "insideLeft", offset: 10, fontSize: 10, fill: C.muted }}
          />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" strokeDasharray="2 3" />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(n: unknown) => `evaluation ${n}`}
            formatter={(v: unknown, name: unknown) => [`${(v as number).toFixed(2)} kcal/mol`, name === "best" ? "running min" : "ΔG"]}
          />
          <Line dataKey="best" type="stepAfter" stroke={C.muted} strokeWidth={1.25} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          <Scatter dataKey="dg" fill={C.dg} isAnimationActive={false}>
            <ErrorBar dataKey="err" direction="y" width={5} stroke={C.dg} strokeWidth={1.25} />
          </Scatter>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Chemical space ────────────────────────────────────────────────────────────

/** MW × cLogP of every scored ligand, with the Lipinski box and the optimisation path. */
export function ChemicalSpacePlot({ molecules }: { molecules: EvaluatedMolecule[] }) {
  const pts = molecules
    .filter((m) => m.admet)
    .map((m, i) => ({ x: m.admet!.mw, y: m.admet!.logp, pass: m.admet!.pass, smiles: m.smiles, n: i + 1, qed: m.admet!.qed }));
  if (!pts.length) return <Empty>Ligand properties appear after the first ADMET pass</Empty>;

  const xMax = Math.max(600, ...pts.map((p) => p.x + 60));
  const yMin = Math.min(-2, ...pts.map((p) => Math.floor(p.y - 0.5)));
  const yMax = Math.max(6, ...pts.map((p) => Math.ceil(p.y + 0.5)));

  return (
    <div className="h-[220px] px-1 pb-1 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 14, bottom: 14, left: 4 }}>
          <CartesianGrid stroke={C.grid} />
          <ReferenceArea x1={0} x2={500} y1={yMin} y2={5} fill={C.pass} fillOpacity={0.06} stroke={C.pass} strokeOpacity={0.35} strokeDasharray="3 3" label={{ value: "Ro5", position: "insideTopRight", fontSize: 10, fill: C.muted }} />
          <XAxis
            type="number"
            dataKey="x"
            domain={[0, xMax]}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: C.grid }}
            label={{ value: "MW (Da)", position: "insideBottom", offset: -8, fontSize: 10, fill: C.muted }}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[yMin, yMax]}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: C.grid }}
            width={40}
            label={{ value: "cLogP", angle: -90, position: "insideLeft", offset: 12, fontSize: 10, fill: C.muted }}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ strokeDasharray: "2 2", stroke: C.muted }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as (typeof pts)[number] | undefined;
              if (!p) return null;
              return (
                <div style={TOOLTIP_STYLE} className="px-2.5 py-1.5 text-white/80">
                  <p className="max-w-[220px] truncate text-white/50">#{p.n} {p.smiles}</p>
                  <p>MW {p.x.toFixed(1)} · cLogP {p.y.toFixed(2)} · QED {p.qed.toFixed(3)}</p>
                  <p style={{ color: p.pass ? C.pass : C.fail }}>{p.pass ? "✓ ADMET pass" : "✕ ADMET fail"}</p>
                </div>
              );
            }}
          />
          <Scatter
            data={pts}
            line={{ stroke: C.muted, strokeDasharray: "3 3", strokeWidth: 1 }}
            isAnimationActive={false}
            shape={(props: { cx?: number; cy?: number; payload?: (typeof pts)[number] }) => {
              const { cx = 0, cy = 0, payload } = props;
              const pass = payload?.pass;
              return pass ? (
                <circle cx={cx} cy={cy} r={5} fill={C.pass} stroke={C.surface} strokeWidth={2} />
              ) : (
                <g stroke={C.fail} strokeWidth={2} strokeLinecap="round">
                  <line x1={cx - 4} y1={cy - 4} x2={cx + 4} y2={cy + 4} />
                  <line x1={cx - 4} y1={cy + 4} x2={cx + 4} y2={cy - 4} />
                </g>
              );
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Property radar ────────────────────────────────────────────────────────────

/** Each ADMET property as a fraction of its limit; the dashed ring is the limit itself. */
export function PropertyRadar({ admet }: { admet: ADMETResult }) {
  const data = admetLoad(admet).map((d) => ({ ...d, plot: Math.min(d.value, 1.5), limit: 1 }));
  return (
    <div className="h-[230px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke={C.grid} />
          <PolarAngleAxis dataKey="key" tick={{ ...AXIS_TICK, fill: C.ink }} />
          <PolarRadiusAxis domain={[0, 1.5]} tick={false} axisLine={false} />
          <Radar dataKey="limit" stroke={C.muted} strokeDasharray="4 3" fill="none" isAnimationActive={false} />
          <Radar dataKey="plot" stroke={admet.passes ? C.pass : C.fail} strokeWidth={2} fill={admet.passes ? C.pass : C.fail} fillOpacity={0.15} isAnimationActive={false} dot={{ r: 2.5 }} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(_v: unknown, name: unknown, item: { payload?: (typeof data)[number] }) =>
              name === "limit" ? [null, null] : [`${item.payload?.raw} (${Math.round((item.payload?.value ?? 0) * 100)}% of limit)`, item.payload?.key]
            }
            labelFormatter={() => ""}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Frontier orbitals ─────────────────────────────────────────────────────────

/** HOMO/LUMO levels per fragment on a shared eV axis, with the gap annotated. */
export function OrbitalDiagram({ descriptors, names }: { descriptors: VQEDescriptor[]; names: (d: VQEDescriptor) => string }) {
  if (!descriptors.length) return <Empty>No VQE descriptors</Empty>;
  const W = 360;
  const H = 230;
  const pad = { l: 42, r: 10, t: 14, b: 34 };
  const lo = Math.floor(Math.min(...descriptors.map((d) => d.homo_energy_ev)) / 5) * 5 - 5;
  const hi = Math.ceil(Math.max(...descriptors.map((d) => d.lumo_energy_ev)) / 5) * 5 + 5;
  const y = (ev: number) => pad.t + ((hi - ev) / (hi - lo)) * (H - pad.t - pad.b);
  const col = (W - pad.l - pad.r) / descriptors.length;
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += 5) ticks.push(t);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[230px] w-full" role="img" aria-label="Frontier orbital energy diagram">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "rgba(255,255,255,0.18)" : C.grid} strokeDasharray={t === 0 ? "2 3" : undefined} />
          <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" style={AXIS_TICK} fill={C.muted}>{t}</text>
        </g>
      ))}
      <text transform={`translate(10 ${(H - pad.b + pad.t) / 2}) rotate(-90)`} textAnchor="middle" fontSize={10} fill={C.muted}>E (eV)</text>
      {descriptors.map((d, i) => {
        const cx = pad.l + col * i + col / 2;
        const half = Math.min(col * 0.32, 34);
        const yh = y(d.homo_energy_ev);
        const yl = y(d.lumo_energy_ev);
        return (
          <g key={d.fragment_id}>
            <title>{`${names(d)}\nHOMO ${d.homo_energy_ev.toFixed(2)} eV · LUMO ${d.lumo_energy_ev.toFixed(2)} eV\ngap ${d.homo_lumo_gap_ev.toFixed(2)} eV · η ${d.chemical_hardness_ev.toFixed(2)} eV`}</title>
            <rect x={cx - col / 2} y={pad.t} width={col} height={H - pad.t - pad.b} fill="transparent" />
            <line x1={cx - half} x2={cx + half} y1={yl} y2={yl} stroke={C.lumo} strokeWidth={2.5} strokeLinecap="round" />
            <line x1={cx - half} x2={cx + half} y1={yh} y2={yh} stroke={C.homo} strokeWidth={2.5} strokeLinecap="round" />
            {/* paired electrons in the HOMO */}
            <text x={cx} y={yh - 4} textAnchor="middle" fontSize={11} fill={C.ink}>↑↓</text>
            <line x1={cx + half + 5} x2={cx + half + 5} y1={yl + 3} y2={yh - 3} stroke={C.muted} strokeWidth={1} markerStart="url(#orb-arrow)" markerEnd="url(#orb-arrow)" />
            <text x={cx + half + 9} y={(yl + yh) / 2 + 3} fontSize={9.5} fill={C.ink} fontFamily="ui-monospace, monospace">{d.homo_lumo_gap_ev.toFixed(1)}</text>
            <text x={cx} y={H - pad.b + 14} textAnchor="middle" fontSize={9.5} fill={C.ink} fontFamily="ui-monospace, monospace">{truncate(names(d), 12)}</text>
          </g>
        );
      })}
      <defs>
        <marker id="orb-arrow" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L6 3 L0 6 z" fill={C.muted} />
        </marker>
      </defs>
      <g fontSize={9.5} fontFamily="ui-monospace, monospace">
        <line x1={pad.l + 4} x2={pad.l + 16} y1={H - 7} y2={H - 7} stroke={C.lumo} strokeWidth={2.5} />
        <text x={pad.l + 20} y={H - 4} fill={C.ink}>LUMO</text>
        <line x1={pad.l + 60} x2={pad.l + 72} y1={H - 7} y2={H - 7} stroke={C.homo} strokeWidth={2.5} />
        <text x={pad.l + 76} y={H - 4} fill={C.ink}>HOMO</text>
        <text x={W - pad.r} y={H - 4} textAnchor="end" fill={C.muted}>gap in eV</text>
      </g>
    </svg>
  );
}

// ── VQE error vs exact diagonalisation ───────────────────────────────────────

/** |E_VQE − E_exact| per fragment on a log scale, against the 1 kcal/mol line. */
export function VqeErrorPlot({ descriptors, names }: { descriptors: VQEDescriptor[]; names: (d: VQEDescriptor) => string }) {
  const rows = descriptors
    .filter((d) => d.exact_energy_hartree != null)
    .map((d) => ({ d, err: Math.abs(d.ground_state_energy_hartree - d.exact_energy_hartree!) }));
  if (!rows.length) return <Empty>No exact reference energies for this run</Empty>;

  const W = 360;
  const rowH = 26;
  const pad = { l: 92, r: 14, t: 10, b: 30 };
  const H = pad.t + pad.b + rows.length * rowH;
  const decades = [-7, -6, -5, -4, -3, -2, -1];
  const lx = (ha: number) => pad.l + ((Math.log10(Math.max(ha, 1e-7)) + 7) / 6) * (W - pad.l - pad.r);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="VQE energy error per fragment">
      {decades.map((p) => (
        <g key={p}>
          <line x1={lx(10 ** p)} x2={lx(10 ** p)} y1={pad.t} y2={H - pad.b} stroke={C.grid} />
          <text x={lx(10 ** p)} y={H - pad.b + 12} textAnchor="middle" style={AXIS_TICK} fill={C.muted}>
            10<tspan dy={-4} fontSize={7}>{p}</tspan>
          </text>
        </g>
      ))}
      <line x1={lx(CHEMICAL_ACCURACY_HA)} x2={lx(CHEMICAL_ACCURACY_HA)} y1={pad.t - 4} y2={H - pad.b} stroke={C.fail} strokeDasharray="4 3" />
      <text x={lx(CHEMICAL_ACCURACY_HA) + 4} y={pad.t + 4} fontSize={9} fill={C.fail}>1 kcal/mol</text>
      {rows.map(({ d, err }, i) => {
        const cy = pad.t + i * rowH + rowH / 2;
        const ok = err <= CHEMICAL_ACCURACY_HA;
        return (
          <g key={d.fragment_id}>
            <title>{`${names(d)}: |ΔE| = ${(err * 1000).toFixed(4)} mHa (${ok ? "within" : "outside"} chemical accuracy)`}</title>
            <text x={pad.l - 8} y={cy + 3} textAnchor="end" fontSize={9.5} fill={C.ink} fontFamily="ui-monospace, monospace">{truncate(names(d), 13)}</text>
            <line x1={pad.l} x2={lx(err)} y1={cy} y2={cy} stroke={C.muted} strokeWidth={1} />
            <circle cx={lx(err)} cy={cy} r={4.5} fill={ok ? C.pass : C.fail} stroke={C.surface} strokeWidth={2} />
          </g>
        );
      })}
      <text x={(W + pad.l) / 2} y={H - 4} textAnchor="middle" fontSize={10} fill={C.muted}>|E_VQE − E_exact| (Ha)</text>
    </svg>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
