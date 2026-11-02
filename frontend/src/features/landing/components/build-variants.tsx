"use client";

import { ArrowUpRight, Check, Copy } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import type { REPO, START } from "../landing-content";
import styles from "../landing.module.css";

type Repo = typeof REPO;
type Start = typeof START;
type Part = Repo["parts"][number];

/** A command with a copy button. */
function Command({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.bvCommand}>
      <pre>
        <code>{text}</code>
      </pre>
      <button
        type="button"
        aria-label="Copy command"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
    </div>
  );
}

// ── Repo 1 · Explorer: a file tree of the monorepo; selecting a part shows its path and command ──
function treeRows(parts: ReadonlyArray<Part>) {
  // Group by the top-level folder so the tree reads like `tree -L 2`.
  const rows: { label: string; depth: number; part?: Part }[] = [];
  const seen = new Set<string>();
  const sorted = [...parts].filter((p) => p.key !== "paper").sort((a, b) => a.path.localeCompare(b.path));
  for (const part of sorted) {
    const [top, ...rest] = part.path.split("/");
    if (!seen.has(top)) {
      seen.add(top);
      rows.push({ label: `${top}/`, depth: 0 });
    }
    rows.push({ label: rest.join("/") || top, depth: 1, part });
  }
  return rows;
}

export function RepoExplorer({ repo }: { repo: Repo }) {
  const [active, setActive] = useState<Part>(repo.parts[1]);
  const rows = treeRows(repo.parts);
  const paper = repo.parts.find((p) => p.key === "paper");
  return (
    <div className={styles.bvExplorer}>
      <div className={styles.bvTree} role="listbox" aria-label="Repository">
        <div className={styles.bvTreeHead}>distributed-quantum/</div>
        {rows.map((row) =>
          row.part ? (
            <button
              key={row.part.key}
              type="button"
              role="option"
              aria-selected={active.key === row.part.key}
              className={styles.bvTreeRow}
              style={{ paddingLeft: `${1 + row.depth * 1.25}rem` }}
              onClick={() => row.part && setActive(row.part)}
            >
              <span className={styles.bvTreeName}>├─ {row.label}</span>
              <span className={styles.bvTreeTag}>{row.part.title}</span>
            </button>
          ) : (
            <div key={row.label} className={styles.bvTreeDir}>
              {row.label}
            </div>
          ),
        )}
        {paper ? (
          <button
            type="button"
            role="option"
            aria-selected={active.key === paper.key}
            className={styles.bvTreeRow}
            onClick={() => setActive(paper)}
          >
            <span className={styles.bvTreeName}>↗ QMeshPy/documentations</span>
            <span className={styles.bvTreeTag}>{paper.title}</span>
          </button>
        ) : null}
      </div>
      <div className={styles.bvDetail} key={active.key}>
        <span className={styles.bvGroup}>{active.group}</span>
        <h3>{active.title}</h3>
        <p>{active.body}</p>
        <span className={styles.bvPath}>{active.path}</span>
        <Command text={active.run} />
        <a href={active.href} target="_blank" rel="noreferrer" className={styles.pillGhost}>
          {repo.github} <ArrowUpRight aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

// ── Repo 2 · Map: the README's architecture as a clickable diagram; "Run a job" sends a pulse ──
const NODES: Record<string, { x: number; y: number; w: number }> = {
  console: { x: 40, y: 40, w: 150 },
  coordinator: { x: 300, y: 40, w: 170 },
  x402: { x: 580, y: 40, w: 140 },
  registry: { x: 580, y: 130, w: 140 },
  peers: { x: 300, y: 200, w: 170 },
  provenance: { x: 580, y: 220, w: 140 },
  benchmarks: { x: 40, y: 200, w: 150 },
  paper: { x: 40, y: 280, w: 150 },
};
const EDGES: [string, string][] = [
  ["console", "coordinator"],
  ["coordinator", "x402"],
  ["coordinator", "registry"],
  ["coordinator", "peers"],
  ["peers", "provenance"],
  ["benchmarks", "coordinator"],
];
const H = 46;
const mid = (k: string): [number, number] => [NODES[k].x + NODES[k].w / 2, NODES[k].y + H / 2];

export function RepoMap({ repo }: { repo: Repo }) {
  const [active, setActive] = useState<Part>(repo.parts[1]);
  const [pulse, setPulse] = useState(0);
  return (
    <div className={styles.bvMapWrap}>
      <div className={styles.bvMap}>
        <svg viewBox="0 0 760 340" role="img" aria-label="Architecture of the repository: console, coordinator, x402, chain registry, peers, provenance, benchmarks and the research paper">
          {EDGES.map(([a, b], i) => {
            const [x1, y1] = mid(a);
            const [x2, y2] = mid(b);
            return (
              <g key={`${a}-${b}`}>
                <line className={styles.bvEdge} x1={x1} y1={y1} x2={x2} y2={y2} />
                {pulse > 0 ? (
                  <circle key={`${pulse}-${i}`} className={styles.bvPulse} r={4}>
                    <animateMotion dur="1.2s" begin={`${i * 0.25}s`} fill="freeze" path={`M ${x1} ${y1} L ${x2} ${y2}`} />
                  </circle>
                ) : null}
              </g>
            );
          })}
          {repo.parts.map((p) => {
            const n = NODES[p.key];
            const on = active.key === p.key;
            return (
              <g
                key={p.key}
                className={styles.bvNode}
                data-on={on}
                tabIndex={0}
                role="button"
                aria-label={p.title}
                onClick={() => setActive(p)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setActive(p)}
              >
                <rect x={n.x} y={n.y} width={n.w} height={H} rx={4} />
                <text x={n.x + 14} y={n.y + 19}>
                  {p.title}
                </text>
                <text className={styles.bvNodeGroup} x={n.x + 14} y={n.y + 35}>
                  {p.group.toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>
        <button type="button" className={styles.pill} onClick={() => setPulse((p) => p + 1)}>
          Run a job through it
        </button>
      </div>
      <div className={styles.bvDetail} key={active.key}>
        <span className={styles.bvGroup}>{active.group}</span>
        <h3>{active.title}</h3>
        <p>{active.body}</p>
        <span className={styles.bvPath}>{active.path}</span>
        <Command text={active.run} />
        <a href={active.href} target="_blank" rel="noreferrer" className={styles.pillGhost}>
          {repo.github} <ArrowUpRight aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

// ── Start 1 · Three paths, one command each ──
export function StartPaths({ start }: { start: Start }) {
  return (
    <div className={styles.bvPaths}>
      {start.paths.map((p, i) => (
        <article key={p.key} className={styles.bvPathCard}>
          <span className={styles.bvStep}>{String(i + 1).padStart(2, "0")}</span>
          <h3>{p.title}</h3>
          <p>{p.body}</p>
          <Command text={p.command} />
          <a href={p.href} target="_blank" rel="noreferrer" className={styles.bvLink}>
            {p.action} <ArrowUpRight aria-hidden="true" />
          </a>
        </article>
      ))}
      <p className={styles.bvFooterLine}>{start.footer.join(" · ")}</p>
    </div>
  );
}

// ── Start 2 · Step-through: pick a path and walk its steps like a terminal session ──
export function StartSteps({ start }: { start: Start }) {
  const [path, setPath] = useState(0);
  const [step, setStep] = useState(0);
  const p = start.paths[path];
  return (
    <div className={styles.bvSteps}>
      <div className={styles.bvStepTabs} role="tablist" aria-label="Ways to start">
        {start.paths.map((x, i) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={i === path}
            onClick={() => {
              setPath(i);
              setStep(0);
            }}
          >
            {x.title}
          </button>
        ))}
      </div>
      <div className={styles.bvStepBody}>
        <div>
          <p>{p.body}</p>
          <Command text={p.command} />
          <a href={p.href} target="_blank" rel="noreferrer" className={styles.bvLink}>
            {p.action} <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
        <ol className={styles.bvTimeline}>
          {p.steps.map((s, i) => (
            <li key={s} data-state={i < step ? "done" : i === step ? "now" : "next"}>
              <button type="button" onClick={() => setStep(i)}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {s}
              </button>
            </li>
          ))}
          <li className={styles.bvTimelineNav}>
            <button type="button" onClick={() => setStep((s) => Math.min(p.steps.length - 1, s + 1))}>
              Next step →
            </button>
          </li>
        </ol>
      </div>
      <p className={styles.bvFooterLine}>{start.footer.join(" · ")}</p>
    </div>
  );
}

// ── Review switches (dev only; ?repo=1|2&start=1|2) ──
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const param = (name: string) => () => (new URLSearchParams(window.location.search).get(name) === "2" ? "2" : "1");
const set = (name: string, v: string) => {
  const url = new URL(window.location.href);
  url.searchParams.set(name, v);
  window.history.replaceState(null, "", url);
  listeners.forEach((l) => l());
};

function Switch({ name, value, labels }: { name: string; value: string; labels: [string, string] }) {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className={styles.bvSwitch} role="group" aria-label={`${name} variant (dev only)`}>
      {labels.map((label, i) => (
        <button key={label} type="button" aria-pressed={value === String(i + 1)} onClick={() => set(name, String(i + 1))}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function RepoLab({ repo }: { repo: Repo }) {
  const v = useSyncExternalStore(subscribe, param("repo"), () => "1");
  return (
    <>
      <Switch name="repo" value={v} labels={["Repo 1 · Explorer", "Repo 2 · Map"]} />
      {v === "2" ? <RepoMap repo={repo} /> : <RepoExplorer repo={repo} />}
    </>
  );
}

export function StartLab({ start }: { start: Start }) {
  const v = useSyncExternalStore(subscribe, param("start"), () => "1");
  return (
    <>
      <Switch name="start" value={v} labels={["Start 1 · Three paths", "Start 2 · Step-through"]} />
      {v === "2" ? <StartSteps start={start} /> : <StartPaths start={start} />}
    </>
  );
}
