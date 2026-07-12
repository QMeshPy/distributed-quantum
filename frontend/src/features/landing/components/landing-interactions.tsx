"use client";

import {
  Activity,
  ArrowRight,
  Boxes,
  Check,
  ChevronRight,
  GitBranch,
  LockKeyhole,
  Menu,
  Network,
  Play,
  Search,
  ShieldCheck,
  Waypoints,
  X,
} from "lucide-react";
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { REPOSITORY_URL } from "../landing-content";
import styles from "../landing-page.module.css";
import { DqsMark } from "./dqs-mark";

const NAV_ITEMS = [
  { label: "Product", href: "#overview" },
  { label: "Workflow", href: "#workflow" },
  { label: "Architecture", href: "#architecture" },
  { label: "Research", href: "#research" },
  { label: "Roadmap", href: "#roadmap" },
] as const;

const ATLAS_STAGES = [
  {
    id: "discover",
    label: "Discover",
    detail: "Scan the fabric. Find available services.",
    color: "#34d9ff",
    icon: Search,
  },
  {
    id: "compose",
    label: "Compose",
    detail: "Build optimal workflows. Plan resource usage.",
    color: "#a478ff",
    icon: GitBranch,
  },
  {
    id: "reserve",
    label: "Reserve",
    detail: "Secure capacity. Establish commitments.",
    color: "#6997ff",
    icon: LockKeyhole,
  },
  {
    id: "execute",
    label: "Execute",
    detail: "Run circuit fragments. Stream live results.",
    color: "#49e2a8",
    icon: Play,
  },
  {
    id: "observe",
    label: "Observe",
    detail: "Inspect outcomes. Verify and iterate.",
    color: "#4ca8ff",
    icon: Activity,
  },
] as const;

const TRACE_STEPS = [
  {
    label: "Discover",
    detail: "27 services found",
    subdetail: "Across 6 providers",
    color: "cyan",
    icon: Search,
  },
  {
    label: "Compose",
    detail: "Workflow score 0.92",
    subdetail: "Depth 5 · Cost 1.21",
    color: "violet",
    icon: GitBranch,
  },
  {
    label: "Reserve",
    detail: "3 services reserved",
    subdetail: "TTL 120s",
    color: "blue",
    icon: LockKeyhole,
  },
  {
    label: "Execute",
    detail: "Circuit executed",
    subdetail: "10,000 shots",
    color: "emerald",
    icon: Play,
  },
  {
    label: "Observe",
    detail: "Result received",
    subdetail: "Fidelity 0.987",
    color: "blue",
    icon: Activity,
  },
  {
    label: "Complete",
    detail: "Total time 2.84s",
    subdetail: "Status success",
    color: "cyan",
    icon: Check,
  },
] as const;

const STORY_STAGES = [
  {
    number: "01",
    label: "Discover",
    title: "Read the fabric before choosing a route.",
    body: "The coordinator turns peer advertisements, health signals, protocols, and capacity into a live service registry.",
    metric: "27 services · 6 providers",
  },
  {
    number: "02",
    label: "Compose",
    title: "Preserve the circuit’s intent as a plan.",
    body: "Operations become dependency-aware fragments. Candidates are ranked, and primary and fallback assignments remain explicit.",
    metric: "5 fragments · score 0.92",
  },
  {
    number: "03",
    label: "Reserve",
    title: "Commit capacity before execution begins.",
    body: "Prepare, commit, and cancel transitions keep unavailable services from silently entering the execution path.",
    metric: "3 reservations · TTL 120s",
  },
  {
    number: "04",
    label: "Execute",
    title: "Move work with bounded recovery.",
    body: "The runtime dispatches circuit fragments, records attempts, and advances to a fallback only when policy allows.",
    metric: "10,000 shots · 2.4s",
  },
  {
    number: "05",
    label: "Observe",
    title: "Return a result with its route attached.",
    body: "State handoffs, outcomes, telemetry, and provenance are assembled into a result that can be inspected and reproduced.",
    metric: "Fidelity 0.987 · verified",
  },
] as const;

const CAPABILITIES = [
  {
    label: "Service discovery",
    title: "See the network as it changes.",
    body: "Peer advertisements publish service IDs, health, addresses, protocols, and capability summaries into a queryable registry.",
    proof: "GossipSub advertisements feed the coordinator’s live model.",
    color: "#34d9ff",
    icon: Network,
  },
  {
    label: "Deterministic planning",
    title: "Make every assignment explainable.",
    body: "Circuit operations become dependency-aware fragments ordered topologically before the planner scores candidates.",
    proof: "Primary and fallback candidates are recorded for every fragment.",
    color: "#9a78ff",
    icon: Boxes,
  },
  {
    label: "Fallback routing",
    title: "Treat recovery as a route, not a surprise.",
    body: "Timeouts, rejected work, connection loss, or degraded quality can advance to the next candidate under bounded policy.",
    proof: "Every retry and fallback remains visible in the event trail.",
    color: "#55a0ff",
    icon: Waypoints,
  },
  {
    label: "Result verification",
    title: "Keep the evidence with the outcome.",
    body: "Fragment handoffs and execution provenance are assembled with the final simulation result for inspection and replay.",
    proof: "The current execution target is Qiskit statevector simulation.",
    color: "#49e2a8",
    icon: ShieldCheck,
  },
] as const;

const ARCHITECTURE_LAYERS = [
  {
    index: "01",
    label: "Interface",
    title: "Workload inputs",
    body: "OpenQASM circuits and domain requests enter through a typed REST boundary.",
    tech: "Next.js · FastAPI",
  },
  {
    index: "02",
    label: "Control",
    title: "Normalize and compose",
    body: "The coordinator preserves dependencies and forms executable circuit fragments.",
    tech: "Parser · DAG builder",
  },
  {
    index: "03",
    label: "Network",
    title: "Discover and plan",
    body: "Published capabilities are filtered and ranked into primary and fallback assignments.",
    tech: "py-libp2p · planner",
  },
  {
    index: "04",
    label: "Execution",
    title: "Reserve and dispatch",
    body: "Capacity is committed before bounded retries and policy-driven fallback begin.",
    tech: "Prepare · commit · cancel",
  },
  {
    index: "05",
    label: "Result",
    title: "Interpret and observe",
    body: "Workers apply fragments while events and projections preserve the complete execution trail.",
    tech: "Qiskit · Postgres · JSONL",
  },
] as const;

const LAYER_PATH = "M 128 74 L 368 16 L 528 96 L 288 154 Z";
const LAYER_INSET = "M 157 78 L 368 28 L 499 94 L 288 144 Z";
const ROUTE_PATH =
  "M 350 50 C 335 98 390 125 350 164 C 306 207 386 231 346 270 C 306 310 390 342 350 380 C 320 410 368 446 346 493";

const ORBIT_PATH = "M330 70A225 225 0 1 1 329.9 70";

const ORBIT_NODES = [
  { x: 330, y: 70 },
  { x: 544, y: 226 },
  { x: 462, y: 476 },
  { x: 198, y: 476 },
  { x: 116, y: 226 },
] as const;

const FRAGMENT_ROUTES = [
  "M104 215C190 215 206 70 328 70H438C548 70 568 118 686 118H788C900 118 914 215 1084 215",
  "M104 215C194 215 218 166 328 166H438C548 166 566 215 686 215H788C902 215 938 215 1084 215",
  "M104 215C194 215 218 264 328 264H438C548 264 566 215 686 215H788C902 215 938 215 1084 215",
  "M104 215C190 215 206 360 328 360H438C548 360 568 312 686 312H788C900 312 914 215 1084 215",
] as const;

const FRAGMENT_NODES = [
  { id: "Q0", label: "PARSE", x: 328, y: 70, color: "#34d9ff" },
  { id: "Q1", label: "MAP", x: 328, y: 166, color: "#9b79ff" },
  { id: "Q2", label: "ENTANGLE", x: 328, y: 264, color: "#4e8fff" },
  { id: "Q3", label: "MEASURE", x: 328, y: 360, color: "#49e2a8" },
] as const;

const PROVIDER_NODES = [
  { id: "H1", label: "PROVIDER A", x: 686, y: 118, color: "#34d9ff" },
  { id: "CX", label: "PROVIDER B", x: 686, y: 215, color: "#9b79ff" },
  { id: "SV", label: "PROVIDER C", x: 686, y: 312, color: "#49e2a8" },
] as const;

const ARCHITECTURE_MODULES = [
  { x: 38, y: 34, side: "left" },
  { x: 302, y: 111, side: "right" },
  { x: 38, y: 188, side: "left" },
  { x: 302, y: 265, side: "right" },
  { x: 38, y: 342, side: "left" },
] as const;

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-70px" });
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={reducedMotion ? false : { opacity: 0, y: 34 }}
      animate={inView || reducedMotion ? { opacity: 1, y: 0 } : undefined}
      transition={{
        duration: 0.82,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 24);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <header
      className={styles.header}
      data-open={open ? "true" : "false"}
      data-scrolled={scrolled ? "true" : "false"}
    >
      <div className={styles.headerInner}>
        <a className={styles.brand} href="#overview" aria-label="DQS home">
          <DqsMark aria-hidden="true" />
          <strong>DQS</strong>
          <span>Distributed Quantum Services</span>
        </a>

        <nav className={styles.desktopNav} aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <a
          className={styles.headerGithub}
          href={REPOSITORY_URL}
          target="_blank"
          rel="noreferrer"
        >
          <GitBranch aria-hidden="true" />
          GitHub
        </a>

        <button
          className={styles.menuButton}
          type="button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.nav
            id="mobile-navigation"
            className={styles.mobileNav}
            aria-label="Mobile navigation"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
          >
            {NAV_ITEMS.map((item, index) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
              >
                <span>0{index + 1}</span>
                {item.label}
                <ChevronRight aria-hidden="true" />
              </a>
            ))}
            <a
              href={REPOSITORY_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
            >
              <GitBranch aria-hidden="true" />
              View on GitHub
              <ArrowRight aria-hidden="true" />
            </a>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

function AtlasLayerContents({ index, color }: { index: number; color: string }) {
  if (index === 0) {
    return (
      <g className={styles.layerDots}>
        {Array.from({ length: 8 }, (_, itemIndex) => (
          <circle
            key={itemIndex}
            cx={230 + (itemIndex % 4) * 54}
            cy={72 + Math.floor(itemIndex / 4) * 36}
            r={itemIndex === 5 ? 5 : 2.4}
            fill={color}
          />
        ))}
        <ellipse cx="350" cy="72" rx="36" ry="15" />
        <ellipse cx="350" cy="72" rx="18" ry="7" />
      </g>
    );
  }

  if (index === 1) {
    return (
      <g className={styles.layerNetwork}>
        <path d="M235 93 287 69 342 91 400 61 451 88" />
        {[235, 287, 342, 400, 451].map((x, itemIndex) => (
          <circle
            key={x}
            cx={x}
            cy={[93, 69, 91, 61, 88][itemIndex]}
            r="7"
            fill={color}
          />
        ))}
      </g>
    );
  }

  if (index === 2) {
    return (
      <g className={styles.layerReservations}>
        {[230, 292, 354, 416].map((x, itemIndex) => (
          <g key={x} transform={`translate(${x} ${94 - (itemIndex % 2) * 18})`}>
            <path d="m0-8 11 6-11 6-11-6 11-6Z" fill={color} />
            <path d="M-4-8v-4a4 4 0 0 1 8 0v4" />
          </g>
        ))}
      </g>
    );
  }

  if (index === 3) {
    return (
      <g className={styles.layerExecution}>
        <path d="M214 106 C275 46 358 135 458 64" />
        {[240, 315, 388, 452].map((x, itemIndex) => (
          <rect
            key={x}
            x={x}
            y={[86, 72, 91, 61][itemIndex]}
            width="13"
            height="13"
            rx="2"
            transform={`rotate(30 ${x + 6.5} ${[86, 72, 91, 61][itemIndex] + 6.5})`}
            fill={color}
          />
        ))}
      </g>
    );
  }

  return (
    <g className={styles.layerTelemetry}>
      {Array.from({ length: 16 }, (_, itemIndex) => (
        <line
          key={itemIndex}
          x1={205 + itemIndex * 17}
          x2={205 + itemIndex * 17}
          y1="112"
          y2={112 - ((itemIndex * 11) % 48)}
          stroke={color}
        />
      ))}
      <path d="M205 104 C250 62 290 116 332 78 S420 103 467 60" />
    </g>
  );
}

export function OrchestrationHero() {
  const reducedMotion = useReducedMotion();
  const rawId = useId();
  const uid = rawId.replaceAll(":", "");

  return (
    <Reveal className={styles.heroAtlasWrap} delay={0.14}>
      <div className={styles.heroAtlasGlow} aria-hidden="true" />
      <svg
        className={styles.heroAtlas}
        viewBox="0 0 720 610"
        role="img"
        aria-label="An exploded orchestration atlas showing discovery, composition, reservation, execution, and observation layers connected by a live route"
      >
        <defs>
          <linearGradient id={`${uid}-route`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#35dcff" />
            <stop offset="0.45" stopColor="#9d78ff" />
            <stop offset="0.78" stopColor="#47e0a6" />
            <stop offset="1" stopColor="#4aa6ff" />
          </linearGradient>
          {ATLAS_STAGES.map((stage, index) => (
            <linearGradient
              key={stage.id}
              id={`${uid}-layer-${index}`}
              x1="0"
              y1="0"
              x2="1"
              y2="1"
            >
              <stop offset="0" stopColor={stage.color} stopOpacity="0.3" />
              <stop offset="0.55" stopColor={stage.color} stopOpacity="0.12" />
              <stop offset="1" stopColor="#020711" stopOpacity="0.5" />
            </linearGradient>
          ))}
          <filter id={`${uid}-glow`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id={`${uid}-grid`} width="22" height="22" patternUnits="userSpaceOnUse">
            <path d="M22 0H0V22" fill="none" stroke="#6d93c8" strokeOpacity="0.11" />
          </pattern>
        </defs>

        <path
          className={styles.atlasAxis}
          d="M350 42V540"
          strokeDasharray="3 8"
        />

        {ATLAS_STAGES.map((stage, index) => (
          <motion.g
            className={styles.atlasLayer}
            key={stage.id}
            initial={reducedMotion ? false : { opacity: 0, y: 130 }}
            animate={{ opacity: 1, y: index * 91 }}
            transition={{
              duration: 1.05,
              delay: 0.18 + index * 0.12,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <path
              d={LAYER_PATH}
              fill={`url(#${uid}-layer-${index})`}
              stroke={stage.color}
              strokeOpacity="0.92"
            />
            <path
              d={LAYER_INSET}
              fill={`url(#${uid}-grid)`}
              stroke={stage.color}
              strokeOpacity="0.24"
            />
            <path
              className={styles.layerDepth}
              d="M128 74v10l160 80 240-58V96L288 154 128 74Z"
              fill={stage.color}
            />
            <AtlasLayerContents index={index} color={stage.color} />
            <line
              className={styles.atlasCalloutLine}
              x1="500"
              y1="96"
              x2="624"
              y2="96"
              stroke={stage.color}
            />
            <circle cx="624" cy="96" r="3.4" fill={stage.color} />
          </motion.g>
        ))}

        <motion.path
          className={styles.atlasRoute}
          d={ROUTE_PATH}
          fill="none"
          stroke={`url(#${uid}-route)`}
          filter={`url(#${uid}-glow)`}
          initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2.4, delay: 0.72, ease: "easeInOut" }}
        />

        {!reducedMotion
          ? [0, 1, 2].map((item) => (
              <circle
                key={item}
                r={item === 0 ? 5 : 3.5}
                fill={item === 2 ? "#49e2a8" : "#e9fbff"}
                filter={`url(#${uid}-glow)`}
              >
                <animateMotion
                  dur={`${5 + item * 0.8}s`}
                  begin={`${item * -1.6}s`}
                  repeatCount="indefinite"
                  path={ROUTE_PATH}
                />
              </circle>
            ))
          : null}
      </svg>

      <ol className={styles.heroCallouts}>
        {ATLAS_STAGES.map((stage, index) => {
          const Icon = stage.icon;
          return (
            <motion.li
              key={stage.id}
              style={{ "--stage-color": stage.color } as CSSProperties}
              initial={reducedMotion ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.55, delay: 0.65 + index * 0.14 }}
            >
              <Icon aria-hidden="true" />
              <div>
                <strong>{stage.label}</strong>
                <span>{stage.detail}</span>
              </div>
            </motion.li>
          );
        })}
      </ol>

      <div className={styles.atlasMeta}>
        <span>Coordinator: DQS</span>
        <span>Fabric: P2P mesh</span>
      </div>
    </Reveal>
  );
}

export function RouteTrace() {
  const reducedMotion = useReducedMotion();
  const rawId = useId();
  const uid = rawId.replaceAll(":", "");

  return (
    <section className={styles.traceSection} aria-labelledby="trace-title">
      <div className={styles.traceTopline}>
        <Reveal>
          <div className={styles.sectionLabel}>
            <span aria-hidden="true" />
            Orchestration trace
          </div>
          <h2 id="trace-title">Every route is explicit.</h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p>
            Transparent orchestration from discovery to execution across the
            quantum fabric.
          </p>
        </Reveal>
      </div>

      <div className={styles.traceCanvas}>
        <svg className={styles.traceSvg} viewBox="0 0 1200 100" aria-hidden="true">
          <defs>
            <linearGradient id={`${uid}-trace`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#34d9ff" />
              <stop offset="0.28" stopColor="#9b79ff" />
              <stop offset="0.55" stopColor="#4b9dff" />
              <stop offset="0.72" stopColor="#49e2a8" />
              <stop offset="1" stopColor="#34d9ff" />
            </linearGradient>
            <filter id={`${uid}-trace-glow`} x="-50%" y="-200%" width="200%" height="500%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            className={styles.traceAmbient}
            d="M60 50H1140"
            fill="none"
            stroke={`url(#${uid}-trace)`}
            filter={`url(#${uid}-trace-glow)`}
          />
          <path
            className={styles.traceCore}
            d="M60 50H1140"
            fill="none"
            stroke={`url(#${uid}-trace)`}
            filter={`url(#${uid}-trace-glow)`}
          />
          <motion.path
            className={styles.traceParticleField}
            d="M60 50H1140"
            fill="none"
            stroke={`url(#${uid}-trace)`}
            filter={`url(#${uid}-trace-glow)`}
            initial={false}
            animate={{ strokeDashoffset: reducedMotion ? 0 : -180 }}
            transition={{ duration: 4.8, ease: "linear", repeat: reducedMotion ? 0 : Infinity }}
          />
          <motion.path
            d="M60 50H1140"
            fill="none"
            stroke={`url(#${uid}-trace)`}
            strokeWidth="2"
            strokeDasharray="2 8"
            filter={`url(#${uid}-trace-glow)`}
            initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
          />
          {!reducedMotion
            ? Array.from({ length: 16 }, (_, item) => (
                <circle
                  key={item}
                  r={item % 5 === 0 ? 4.6 : item % 3 === 0 ? 3.1 : 2.1}
                  fill={["#effdff", "#34d9ff", "#9b79ff", "#4f9cff", "#49e2a8"][item % 5]}
                  filter={`url(#${uid}-trace-glow)`}
                >
                  <animateMotion
                    dur={`${6.2 + (item % 4) * 0.55}s`}
                    begin={`${item * -0.42}s`}
                    repeatCount="indefinite"
                    path="M60 50H1140"
                  />
                </circle>
              ))
            : null}
        </svg>

        <ol className={styles.traceSteps}>
          {TRACE_STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.li
                key={step.label}
                data-tone={step.color}
                initial={reducedMotion ? false : { opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.55, delay: index * 0.1 }}
              >
                <strong>{step.label}</strong>
                <span className={styles.traceNode}>
                  <Icon aria-hidden="true" />
                </span>
                <span>{step.detail}</span>
                <small>{step.subdetail}</small>
              </motion.li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export function ProblemFragmentation() {
  const reducedMotion = useReducedMotion();
  const rawId = useId();
  const uid = rawId.replaceAll(":", "");

  return (
    <Reveal className={styles.problemVisual} delay={0.18}>
      <div className={styles.problemVisualTopline} aria-hidden="true">
        <span>Intent-preserving fragmentation</span>
        <span>4 fragments / 3 providers / 1 result</span>
      </div>
      <svg
        className={styles.fragmentDesktopSvg}
        viewBox="0 0 1200 430"
        role="img"
        aria-label="A circuit intent branching into four fragments across three providers before converging into one verified result"
      >
        <defs>
          <linearGradient id={`${uid}-fragment-route`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#34d9ff" />
            <stop offset="0.42" stopColor="#9b79ff" />
            <stop offset="0.72" stopColor="#4e8fff" />
            <stop offset="1" stopColor="#49e2a8" />
          </linearGradient>
          <radialGradient id={`${uid}-fragment-core`}>
            <stop offset="0" stopColor="#34d9ff" stopOpacity="0.3" />
            <stop offset="1" stopColor="#34d9ff" stopOpacity="0" />
          </radialGradient>
          <filter id={`${uid}-fragment-glow`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id={`${uid}-fragment-grid`} width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#86a9da" strokeOpacity="0.06" />
          </pattern>
        </defs>

        <rect width="1200" height="430" fill={`url(#${uid}-fragment-grid)`} />
        <g className={styles.fragmentLanes}>
          {FRAGMENT_ROUTES.map((route) => (
            <path key={`base-${route}`} d={route} />
          ))}
        </g>
        {FRAGMENT_ROUTES.map((route, index) => (
          <motion.path
            className={styles.fragmentRoute}
            key={route}
            d={route}
            fill="none"
            stroke={`url(#${uid}-fragment-route)`}
            filter={index === 1 ? `url(#${uid}-fragment-glow)` : undefined}
            initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 0.84 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 1.45, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}

        <g className={styles.fragmentSource}>
          <circle cx="104" cy="215" r="64" fill={`url(#${uid}-fragment-core)`} />
          <path d="m104 177 38 38-38 38-38-38 38-38Z" />
          <text x="104" y="211" textAnchor="middle">INTENT</text>
          <text x="104" y="229" textAnchor="middle">QASM</text>
        </g>

        {FRAGMENT_NODES.map((node, index) => (
          <motion.g
            className={styles.fragmentCard}
            key={node.id}
            initial={reducedMotion ? false : { opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.5, delay: 0.24 + index * 0.1 }}
          >
            <rect x={node.x - 10} y={node.y - 23} width="116" height="46" rx="4" />
            <line x1={node.x + 16} y1={node.y - 23} x2={node.x + 16} y2={node.y + 23} stroke={node.color} />
            <text x={node.x + 3} y={node.y + 5} textAnchor="middle" fill={node.color}>{node.id}</text>
            <text x={node.x + 29} y={node.y + 5}>{node.label}</text>
          </motion.g>
        ))}

        {PROVIDER_NODES.map((node, index) => (
          <motion.g
            className={styles.providerNode}
            key={node.id}
            initial={reducedMotion ? false : { opacity: 0, scale: 0.7 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.5, delay: 0.54 + index * 0.1 }}
            style={{ transformOrigin: `${node.x}px ${node.y}px` }}
          >
            <path
              d={`M${node.x} ${node.y - 30} ${node.x + 34} ${node.y - 15} ${node.x + 34} ${node.y + 15} ${node.x} ${node.y + 30} ${node.x - 34} ${node.y + 15} ${node.x - 34} ${node.y - 15}Z`}
              stroke={node.color}
            />
            <text x={node.x} y={node.y + 5} textAnchor="middle" fill={node.color}>{node.id}</text>
            <text x={node.x + 52} y={node.y + 5}>{node.label}</text>
          </motion.g>
        ))}

        <g className={styles.fragmentResult} filter={`url(#${uid}-fragment-glow)`}>
          <circle cx="1084" cy="215" r="52" />
          <circle cx="1084" cy="215" r="34" />
          <path d="m1069 215 10 10 20-22" />
          <text x="1084" y="287" textAnchor="middle">VERIFIED RESULT</text>
        </g>

        {!reducedMotion
          ? FRAGMENT_ROUTES.map((route, index) => (
              <circle
                key={`packet-${route}`}
                r={index === 0 ? 4.5 : 3.2}
                fill={["#effdff", "#9b79ff", "#4e8fff", "#49e2a8"][index]}
                filter={`url(#${uid}-fragment-glow)`}
              >
                <animateMotion
                  dur={`${5.2 + index * 0.55}s`}
                  begin={`${index * -1.25}s`}
                  repeatCount="indefinite"
                  path={route}
                />
              </circle>
            ))
          : null}
      </svg>
      <svg
        className={styles.fragmentMobileSvg}
        viewBox="0 0 360 620"
        role="img"
        aria-label="A circuit intent splitting into four fragments, crossing three providers, and returning one verified result"
      >
        <defs>
          <linearGradient id={`${uid}-fragment-mobile`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#34d9ff" />
            <stop offset="0.45" stopColor="#9b79ff" />
            <stop offset="1" stopColor="#49e2a8" />
          </linearGradient>
          <filter id={`${uid}-fragment-mobile-glow`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {[
          "M180 82C180 124 50 122 50 174V222C50 274 80 280 80 326V392C80 440 180 449 180 514",
          "M180 82C180 126 135 128 135 174V222C135 270 180 280 180 326V392C180 440 180 460 180 514",
          "M180 82C180 126 225 128 225 174V222C225 270 180 280 180 326V392C180 440 180 460 180 514",
          "M180 82C180 124 310 122 310 174V222C310 274 280 280 280 326V392C280 440 180 449 180 514",
        ].map((route, index) => (
          <motion.path
            className={styles.fragmentRoute}
            key={`mobile-${route}`}
            d={route}
            fill="none"
            stroke={`url(#${uid}-fragment-mobile)`}
            initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 0.82 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 1.35, delay: index * 0.1 }}
          />
        ))}
        <g className={styles.fragmentSource}>
          <path d="m180 24 34 34-34 34-34-34 34-34Z" />
          <text x="180" y="54" textAnchor="middle">INTENT</text>
          <text x="180" y="72" textAnchor="middle">QASM</text>
        </g>
        {[50, 135, 225, 310].map((x, index) => (
          <g className={styles.fragmentCard} key={`mobile-fragment-${x}`}>
            <rect x={x - 27} y="174" width="54" height="48" rx="4" />
            <text x={x} y="204" textAnchor="middle" fill={ATLAS_STAGES[index].color}>Q{index}</text>
          </g>
        ))}
        {[
          { x: 80, label: "A", color: "#34d9ff" },
          { x: 180, label: "B", color: "#9b79ff" },
          { x: 280, label: "C", color: "#49e2a8" },
        ].map((provider) => (
          <g className={styles.providerNode} key={`mobile-provider-${provider.label}`}>
            <path d={`M${provider.x} 326 ${provider.x + 30} 343 ${provider.x + 30} 377 ${provider.x} 394 ${provider.x - 30} 377 ${provider.x - 30} 343Z`} stroke={provider.color} />
            <text x={provider.x} y="365" textAnchor="middle" fill={provider.color}>P{provider.label}</text>
          </g>
        ))}
        <g className={styles.fragmentResult} filter={`url(#${uid}-fragment-mobile-glow)`}>
          <circle cx="180" cy="548" r="48" />
          <circle cx="180" cy="548" r="31" />
          <path d="m166 548 10 10 20-22" />
          <text x="180" y="613" textAnchor="middle">VERIFIED RESULT</text>
        </g>
      </svg>
    </Reveal>
  );
}

export function ScrollOrchestration() {
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const [activeStage, setActiveStage] = useState(0);
  const rawId = useId();
  const uid = rawId.replaceAll(":", "");
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });
  const progress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 28,
    mass: 0.42,
  });

  useMotionValueEvent(progress, "change", (value) => {
    const nextStage = Math.min(STORY_STAGES.length - 1, Math.floor(value * 5));
    setActiveStage((current) => (current === nextStage ? current : nextStage));
  });

  const routeLength = useTransform(progress, [0.04, 0.9], [0, 1]);
  const orbitRotation = useTransform(progress, [0, 1], [0, 288]);
  const counterRotation = useTransform(progress, [0, 1], [0, -144]);
  const story = STORY_STAGES[activeStage];
  const stageColor = ATLAS_STAGES[activeStage].color;

  return (
    <section
      className={styles.storySection}
      id="orchestration-story"
      ref={sectionRef}
    >
      <div className={styles.storySticky}>
        <div className={styles.storyCopy}>
          <div className={styles.sectionLabel}>
            <span aria-hidden="true" />
            Live orchestration model
          </div>

          <div className={styles.storyCount}>
            <span>{story.number}</span>
            <span>/ 05</span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              className={styles.storyText}
              key={story.label}
              initial={reducedMotion ? false : { opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            >
              <strong>{story.label}</strong>
              <h2>{story.title}</h2>
              <p>{story.body}</p>
              <span className={styles.storyMetric}>{story.metric}</span>
            </motion.div>
          </AnimatePresence>

          <ol className={styles.storyNav} aria-label="Orchestration stages">
            {STORY_STAGES.map((stage, index) => (
              <li key={stage.label} data-active={activeStage === index ? "true" : "false"}>
                <span>0{index + 1}</span>
                {stage.label}
              </li>
            ))}
          </ol>
        </div>

        <div className={styles.storyVisual}>
          <div className={styles.storyVisualLabel}>
            <span>Scroll-linked system view</span>
            <span>Route 7A3F</span>
          </div>
          <svg
            viewBox="0 0 660 590"
            role="img"
            aria-label="A scroll-linked orbital state machine advancing through discover, compose, reserve, execute, and observe"
          >
            <defs>
              <linearGradient id={`${uid}-story-route`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#34d9ff" />
                <stop offset="0.34" stopColor="#9b79ff" />
                <stop offset="0.67" stopColor="#4e8fff" />
                <stop offset="1" stopColor="#49e2a8" />
              </linearGradient>
              <filter id={`${uid}-story-glow`} x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <radialGradient id={`${uid}-story-core`}>
                <stop offset="0" stopColor={stageColor} stopOpacity="0.32" />
                <stop offset="0.55" stopColor={stageColor} stopOpacity="0.08" />
                <stop offset="1" stopColor={stageColor} stopOpacity="0" />
              </radialGradient>
            </defs>

            <circle className={styles.storyOrbitAmbient} cx="330" cy="295" r="258" />
            <circle className={styles.storyOrbitAmbient} cx="330" cy="295" r="176" />

            <motion.g
              className={styles.storyOrbitDial}
              style={{
                rotate: reducedMotion ? 0 : orbitRotation,
                transformOrigin: "330px 295px",
              }}
            >
              <circle cx="330" cy="295" r="245" strokeDasharray="3 17" />
              <circle cx="330" cy="295" r="196" strokeDasharray="1 12" />
            </motion.g>
            <motion.g
              className={styles.storyOrbitDialSecondary}
              style={{
                rotate: reducedMotion ? 0 : counterRotation,
                transformOrigin: "330px 295px",
              }}
            >
              <path d="M330 105A190 190 0 0 1 520 295" />
              <path d="M330 485A190 190 0 0 1 140 295" />
            </motion.g>

            {ORBIT_NODES.map((node, index) => {
              const stage = ATLAS_STAGES[index];
              const isActive = activeStage === index;
              const isReached = activeStage >= index;
              return (
                <g className={styles.storyOrbitNode} key={stage.id}>
                  <motion.line
                    x1="330"
                    y1="295"
                    x2={node.x}
                    y2={node.y}
                    stroke={stage.color}
                    animate={{ opacity: isActive ? 0.48 : isReached ? 0.18 : 0.07 }}
                    transition={{ duration: 0.35 }}
                  />
                  <motion.circle
                    cx={node.x}
                    cy={node.y}
                    r="28"
                    opacity="0.035"
                    fill={stage.color}
                    animate={{ r: isActive ? 38 : 28, opacity: isActive ? 0.13 : 0.035 }}
                    transition={{ duration: 0.4 }}
                  />
                  <motion.circle
                    cx={node.x}
                    cy={node.y}
                    r="19"
                    fill="#050c19"
                    stroke={stage.color}
                    animate={{ strokeOpacity: isReached ? 1 : 0.28, strokeWidth: isActive ? 2.4 : 1.2 }}
                    transition={{ duration: 0.35 }}
                    filter={isActive ? `url(#${uid}-story-glow)` : undefined}
                  />
                  <circle cx={node.x} cy={node.y} r="4" fill={stage.color} opacity={isReached ? 1 : 0.35} />
                  <text x={node.x} y={node.y + 44} textAnchor="middle" fill={isActive ? stage.color : "#75849b"}>
                    {stage.label.toUpperCase()}
                  </text>
                  <text x={node.x} y={node.y - 31} textAnchor="middle">0{index + 1}</text>
                </g>
              );
            })}

            <circle cx="330" cy="295" r="126" fill={`url(#${uid}-story-core)`} />
            <motion.circle
              className={styles.storyCoreRing}
              cx="330"
              cy="295"
              r="82"
              opacity="0.26"
              animate={{ r: [82, 90, 82], opacity: [0.26, 0.55, 0.26] }}
              transition={{ duration: 3.2, repeat: reducedMotion ? 0 : Infinity, ease: "easeInOut" }}
              stroke={stageColor}
            />
            <path className={styles.storyCoreMark} d="m330 244 51 51-51 51-51-51 51-51Z" stroke={stageColor} />
            <text className={styles.storyCoreEyebrow} x="330" y="282" textAnchor="middle">ACTIVE STATE</text>
            <AnimatePresence mode="wait">
              <motion.text
                className={styles.storyCoreLabel}
                key={story.label}
                x="330"
                y="311"
                textAnchor="middle"
                fill={stageColor}
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28 }}
              >
                {story.label.toUpperCase()}
              </motion.text>
            </AnimatePresence>
            <text className={styles.storyCoreRoute} x="330" y="331" textAnchor="middle">ROUTE 7A3F</text>

            <motion.path
              className={styles.storyOrbitRoute}
              d={ORBIT_PATH}
              fill="none"
              stroke={`url(#${uid}-story-route)`}
              filter={`url(#${uid}-story-glow)`}
              style={{ pathLength: reducedMotion ? 1 : routeLength }}
            />
            {!reducedMotion ? (
              <circle r="5" fill="#f4fdff" filter={`url(#${uid}-story-glow)`}>
                <animateMotion dur="7.2s" repeatCount="indefinite" path={ORBIT_PATH} />
              </circle>
            ) : null}
          </svg>
          <div className={styles.storyStatus}>
            <span>State</span>
            <strong>{story.label}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

export function CapabilityExplorer() {
  const [active, setActive] = useState(0);
  const reducedMotion = useReducedMotion();
  const capability = CAPABILITIES[active];
  const rawId = useId();
  const uid = rawId.replaceAll(":", "");

  return (
    <section className={styles.capabilitySection} id="capabilities">
      <div className={styles.capabilityIntro}>
        <Reveal>
          <div className={styles.sectionLabel}>
            <span aria-hidden="true" />
            Capability fabric
          </div>
          <h2>The workflow keeps its intent. The route can adapt.</h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p>
            Select a capability to see how the control plane changes the active
            route without hiding the decision from the operator.
          </p>
        </Reveal>
      </div>

      <div className={styles.capabilityWorkspace}>
        <div className={styles.capabilityTabs} role="tablist" aria-label="DQS capabilities">
          {CAPABILITIES.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                role="tab"
                aria-selected={active === index}
                aria-controls="capability-panel"
                data-active={active === index ? "true" : "false"}
                style={{ "--capability-color": item.color } as CSSProperties}
                onClick={() => setActive(index)}
              >
                <span>0{index + 1}</span>
                <Icon aria-hidden="true" />
                {item.label}
                <ArrowRight aria-hidden="true" />
              </button>
            );
          })}
        </div>

        <div
          className={styles.capabilityPanel}
          id="capability-panel"
          role="tabpanel"
          style={{ "--capability-color": capability.color } as CSSProperties}
        >
          <div className={styles.capabilityGraph}>
            <svg
              viewBox="0 0 680 390"
              role="img"
              aria-label={`Animated service fabric highlighting ${capability.label}`}
            >
              <defs>
                <radialGradient id={`${uid}-cap-node`}>
                  <stop offset="0" stopColor={capability.color} stopOpacity="0.42" />
                  <stop offset="1" stopColor={capability.color} stopOpacity="0" />
                </radialGradient>
                <filter id={`${uid}-cap-glow`} x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="7" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <g className={styles.capabilityGrid}>
                {Array.from({ length: 12 }, (_, index) => (
                  <line key={`v-${index}`} x1={index * 62} x2={index * 62} y1="0" y2="390" />
                ))}
                {Array.from({ length: 8 }, (_, index) => (
                  <line key={`h-${index}`} x1="0" x2="680" y1={index * 56} y2={index * 56} />
                ))}
              </g>

              {[
                "M340 195C270 76 166 86 92 132",
                "M340 195C438 72 550 92 604 145",
                "M340 195C262 286 152 292 98 252",
                "M340 195C430 302 554 287 610 248",
              ].map((path, index) => (
                <motion.path
                  key={path}
                  d={path}
                  fill="none"
                  stroke={capability.color}
                  strokeWidth={active === index ? 3.5 : 1.4}
                  strokeOpacity={active === index ? 1 : 0.34}
                  strokeDasharray={active === index ? "1 0" : "4 8"}
                  filter={active === index ? `url(#${uid}-cap-glow)` : undefined}
                  initial={reducedMotion ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8, delay: index * 0.08 }}
                />
              ))}

              {[
                [92, 132],
                [604, 145],
                [98, 252],
                [610, 248],
              ].map(([x, y], index) => (
                <motion.g
                  key={`${x}-${y}`}
                  animate={{ opacity: active === index ? 1 : 0.48, scale: active === index ? 1.1 : 1 }}
                  transition={{ duration: 0.35 }}
                >
                  <circle cx={x} cy={y} r="46" fill={`url(#${uid}-cap-node)`} />
                  <circle cx={x} cy={y} r="24" className={styles.capabilityNode} />
                  <circle cx={x} cy={y} r="4" fill={capability.color} />
                </motion.g>
              ))}

              <circle cx="340" cy="195" r="76" fill={`url(#${uid}-cap-node)`} />
              <path
                d="m340 150 45 45-45 45-45-45 45-45Z"
                className={styles.capabilityCore}
                stroke={capability.color}
                filter={`url(#${uid}-cap-glow)`}
              />
              <text x="340" y="201" textAnchor="middle" className={styles.capabilityCoreText}>
                DQS
              </text>

              {!reducedMotion ? (
                <circle r="5" fill="#f3fdff" filter={`url(#${uid}-cap-glow)`}>
                  <animateMotion
                    dur="3.6s"
                    repeatCount="indefinite"
                    path={[
                      "M340 195C270 76 166 86 92 132",
                      "M340 195C438 72 550 92 604 145",
                      "M340 195C262 286 152 292 98 252",
                      "M340 195C430 302 554 287 610 248",
                    ][active]}
                  />
                </circle>
              ) : null}
            </svg>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              className={styles.capabilityText}
              key={capability.label}
              initial={reducedMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
            >
              <span>{capability.label}</span>
              <h3>{capability.title}</h3>
              <p>{capability.body}</p>
              <div>
                <Check aria-hidden="true" />
                {capability.proof}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

export function ArchitectureAtlas() {
  const [active, setActive] = useState(0);
  const reducedMotion = useReducedMotion();
  const rawId = useId();
  const uid = rawId.replaceAll(":", "");
  const layer = ARCHITECTURE_LAYERS[active];

  return (
    <section className={styles.architectureSection} id="architecture">
      <div className={styles.architectureIntro}>
        <Reveal>
          <div className={styles.sectionLabel}>
            <span aria-hidden="true" />
            Architecture atlas
          </div>
          <h2>A control plane, execution plane, and data trail in one stack.</h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p>
            Open a layer to follow the real implementation boundary from browser
            interface to distributed worker and back.
          </p>
        </Reveal>
      </div>

      <div className={styles.architectureWorkspace}>
        <div className={styles.architectureLayers}>
          {ARCHITECTURE_LAYERS.map((item, index) => (
            <motion.button
              key={item.index}
              type="button"
              data-active={active === index ? "true" : "false"}
              onClick={() => setActive(index)}
              whileHover={reducedMotion ? undefined : { x: 8 }}
              transition={{ duration: 0.2 }}
            >
              <span>{item.index}</span>
              <strong>{item.label}</strong>
              <small>{item.title}</small>
              <ArrowRight aria-hidden="true" />
            </motion.button>
          ))}
        </div>

        <div className={styles.architectureDetail}>
          <div className={styles.architectureCoordinates} aria-hidden="true">
            <span>FIG_0{active + 1}</span>
            <span>BOUNDARY / {layer.label.toUpperCase()}</span>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={layer.index}
              initial={reducedMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.38 }}
            >
              <span>{layer.index} / {layer.label}</span>
              <h3>{layer.title}</h3>
              <p>{layer.body}</p>
              <strong>{layer.tech}</strong>
            </motion.div>
          </AnimatePresence>

          <div className={styles.architectureDiagram}>
            <svg
              className={styles.architectureDesktopSvg}
              viewBox="0 0 520 455"
              role="img"
              aria-label="Five architecture modules connected to a live vertical control bus"
            >
              <defs>
                <linearGradient id={`${uid}-architecture-route`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#34d9ff" />
                  <stop offset="0.5" stopColor="#867cff" />
                  <stop offset="1" stopColor="#49e2a8" />
                </linearGradient>
                <filter id={`${uid}-architecture-glow`} x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <linearGradient id={`${uid}-architecture-module`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#34d9ff" stopOpacity="0.12" />
                  <stop offset="1" stopColor="#4e8fff" stopOpacity="0.02" />
                </linearGradient>
                <marker id={`${uid}-architecture-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M0 0 10 5 0 10Z" fill="#49e2a8" />
                </marker>
              </defs>

              <rect className={styles.architectureBusHousing} x="239" y="18" width="42" height="419" rx="21" />
              <motion.path
                className={styles.architectureRoute}
                d="M260 30V425"
                fill="none"
                stroke={`url(#${uid}-architecture-route)`}
                filter={`url(#${uid}-architecture-glow)`}
                markerEnd={`url(#${uid}-architecture-arrow)`}
                initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.45, delay: 0.28 }}
              />

              {ARCHITECTURE_LAYERS.map((item, index) => {
                const modulePosition = ARCHITECTURE_MODULES[index];
                const isLeft = modulePosition.side === "left";
                const centerY = modulePosition.y + 29;
                const color = ATLAS_STAGES[index].color;
                const isActive = active === index;
                return (
                  <motion.g
                    className={styles.architectureModule}
                    key={item.index}
                    data-active={isActive ? "true" : "false"}
                    initial={reducedMotion ? false : { opacity: 0, x: isLeft ? -24 : 24 }}
                    animate={{ opacity: isActive ? 1 : 0.5, x: isActive ? (isLeft ? -5 : 5) : 0 }}
                    transition={{ duration: 0.42, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <motion.path
                      className={styles.architectureConnector}
                      d={isLeft ? `M${modulePosition.x + 180} ${centerY}H260` : `M260 ${centerY}H${modulePosition.x}`}
                      stroke={color}
                      animate={{ strokeOpacity: isActive ? 1 : 0.24 }}
                      filter={isActive ? `url(#${uid}-architecture-glow)` : undefined}
                    />
                    <rect
                      x={modulePosition.x}
                      y={modulePosition.y}
                      width="180"
                      height="58"
                      rx="7"
                      fill={isActive ? `url(#${uid}-architecture-module)` : "rgba(5,12,25,0.78)"}
                      stroke={color}
                    />
                    <rect
                      className={styles.architectureModuleIndex}
                      x={modulePosition.x + 12}
                      y={modulePosition.y + 12}
                      width="34"
                      height="34"
                      rx="4"
                      stroke={color}
                    />
                    <text className={styles.architectureModuleNumber} x={modulePosition.x + 29} y={modulePosition.y + 34} textAnchor="middle" fill={color}>
                      {item.index}
                    </text>
                    <text className={styles.architectureModuleLabel} x={modulePosition.x + 58} y={modulePosition.y + 35}>
                      {item.label.toUpperCase()}
                    </text>
                    <motion.circle
                      cx="260"
                      cy={centerY}
                      r="3.5"
                      opacity="0.42"
                      fill={color}
                      animate={{ r: isActive ? 7 : 3.5, opacity: isActive ? 1 : 0.42 }}
                      transition={{ duration: 0.35 }}
                      filter={isActive ? `url(#${uid}-architecture-glow)` : undefined}
                    />
                    {isActive ? (
                      <motion.line
                        className={styles.architectureModuleScan}
                        x1={modulePosition.x + 55}
                        x2={modulePosition.x + 164}
                        y1={modulePosition.y + 51}
                        y2={modulePosition.y + 51}
                        stroke={color}
                        initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 0.55 }}
                      />
                    ) : null}
                  </motion.g>
                );
              })}

              <motion.circle
                className={styles.architectureBusPulse}
                cx="260"
                cy={ARCHITECTURE_MODULES[active].y + 29}
                r="12"
                opacity="0.48"
                animate={{
                  cy: ARCHITECTURE_MODULES[active].y + 29,
                  r: [12, 21, 12],
                  opacity: [0.48, 0, 0.48],
                }}
                transition={{
                  cy: { duration: 0.48, ease: [0.22, 1, 0.36, 1] },
                  r: { duration: 1.8, repeat: reducedMotion ? 0 : Infinity },
                  opacity: { duration: 1.8, repeat: reducedMotion ? 0 : Infinity },
                }}
                stroke={ATLAS_STAGES[active].color}
              />

              {!reducedMotion ? (
                <>
                  <circle r="5" fill="#f2fdff" filter={`url(#${uid}-architecture-glow)`}>
                    <animateMotion dur="4.6s" repeatCount="indefinite" path="M260 30V425" />
                  </circle>
                  <circle r="3.2" fill="#49e2a8" filter={`url(#${uid}-architecture-glow)`}>
                    <animateMotion dur="5.4s" begin="-2.1s" repeatCount="indefinite" path="M260 30V425" />
                  </circle>
                </>
                ) : null}
            </svg>
            <svg
              className={styles.architectureMobileSvg}
              viewBox="0 0 320 560"
              role="img"
              aria-label="Five readable architecture modules connected to a live mobile control bus"
            >
              <defs>
                <linearGradient id={`${uid}-architecture-mobile-route`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#34d9ff" />
                  <stop offset="0.5" stopColor="#867cff" />
                  <stop offset="1" stopColor="#49e2a8" />
                </linearGradient>
                <filter id={`${uid}-architecture-mobile-glow`} x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <rect className={styles.architectureBusHousing} x="32" y="18" width="38" height="524" rx="19" />
              <motion.path
                className={styles.architectureRoute}
                d="M51 32V526"
                fill="none"
                stroke={`url(#${uid}-architecture-mobile-route)`}
                filter={`url(#${uid}-architecture-mobile-glow)`}
                initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.35 }}
              />
              {ARCHITECTURE_LAYERS.map((item, index) => {
                const y = 24 + index * 103;
                const color = ATLAS_STAGES[index].color;
                const isActive = active === index;
                return (
                  <motion.g
                    className={styles.architectureModule}
                    data-active={isActive ? "true" : "false"}
                    key={`mobile-${item.index}`}
                    initial={reducedMotion ? false : { opacity: 0, x: 18 }}
                    animate={{ opacity: isActive ? 1 : 0.5, x: isActive ? 5 : 0 }}
                    transition={{ duration: 0.4, delay: index * 0.05 }}
                  >
                    <path
                      className={styles.architectureConnector}
                      d={`M51 ${y + 35}H86`}
                      stroke={color}
                      opacity={isActive ? 1 : 0.28}
                    />
                    <rect
                      x="86"
                      y={y}
                      width="214"
                      height="70"
                      rx="7"
                      fill={isActive ? "rgba(52,217,255,0.1)" : "rgba(5,12,25,0.9)"}
                      stroke={color}
                    />
                    <rect
                      className={styles.architectureModuleIndex}
                      x="100"
                      y={y + 16}
                      width="38"
                      height="38"
                      rx="4"
                      stroke={color}
                    />
                    <text className={styles.architectureModuleNumber} x="119" y={y + 41} textAnchor="middle" fill={color}>
                      {item.index}
                    </text>
                    <text className={styles.architectureModuleLabel} x="153" y={y + 42}>
                      {item.label.toUpperCase()}
                    </text>
                    <motion.circle
                      cx="51"
                      cy={y + 35}
                      r="3.5"
                      opacity="0.42"
                      fill={color}
                      animate={{ r: isActive ? 7 : 3.5, opacity: isActive ? 1 : 0.42 }}
                      filter={isActive ? `url(#${uid}-architecture-mobile-glow)` : undefined}
                    />
                    {isActive ? (
                      <motion.line
                        className={styles.architectureModuleScan}
                        x1="151"
                        x2="282"
                        y1={y + 56}
                        y2={y + 56}
                        stroke={color}
                        initial={reducedMotion ? false : { pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.5 }}
                      />
                    ) : null}
                  </motion.g>
                );
              })}
              <motion.circle
                className={styles.architectureBusPulse}
                cx="51"
                cy={59 + active * 103}
                r="11"
                opacity="0.5"
                animate={{ cy: 59 + active * 103, r: [11, 20, 11], opacity: [0.5, 0, 0.5] }}
                transition={{
                  cy: { duration: 0.48, ease: [0.22, 1, 0.36, 1] },
                  r: { duration: 1.8, repeat: reducedMotion ? 0 : Infinity },
                  opacity: { duration: 1.8, repeat: reducedMotion ? 0 : Infinity },
                }}
                stroke={ATLAS_STAGES[active].color}
              />
              {!reducedMotion ? (
                <circle r="4.5" fill="#efffff" filter={`url(#${uid}-architecture-mobile-glow)`}>
                  <animateMotion dur="5s" repeatCount="indefinite" path="M51 32V526" />
                </circle>
              ) : null}
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ClosingConvergence() {
  const reducedMotion = useReducedMotion();
  const rawId = useId();
  const uid = rawId.replaceAll(":", "");
  const incoming = [
    "M34 30C172 30 252 108 408 125",
    "M34 90C188 90 268 118 408 125",
    "M34 178C188 178 268 132 408 125",
    "M34 232C172 232 252 142 408 125",
  ];

  return (
    <div className={styles.closingConvergence} aria-hidden="true">
      <svg viewBox="0 0 900 260">
        <defs>
          <linearGradient id={`${uid}-closing-in`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#4e8fff" stopOpacity="0.14" />
            <stop offset="0.48" stopColor="#9b79ff" />
            <stop offset="1" stopColor="#34d9ff" />
          </linearGradient>
          <linearGradient id={`${uid}-closing-out`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#34d9ff" />
            <stop offset="1" stopColor="#49e2a8" stopOpacity="0.12" />
          </linearGradient>
          <radialGradient id={`${uid}-closing-halo`}>
            <stop offset="0" stopColor="#34d9ff" stopOpacity="0.28" />
            <stop offset="1" stopColor="#34d9ff" stopOpacity="0" />
          </radialGradient>
          <filter id={`${uid}-closing-glow`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {incoming.map((path, index) => (
          <motion.path
            className={styles.closingIncoming}
            key={path}
            d={path}
            fill="none"
            stroke={`url(#${uid}-closing-in)`}
            initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 0.82 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 1.1, delay: index * 0.1 }}
          />
        ))}

        <motion.path
          className={styles.closingOutgoing}
          d="M492 125H866"
          fill="none"
          stroke={`url(#${uid}-closing-out)`}
          filter={`url(#${uid}-closing-glow)`}
          initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 1.3, delay: 0.55 }}
        />

        <motion.circle
          cx="450"
          cy="125"
          r="68"
          opacity="0.5"
          fill={`url(#${uid}-closing-halo)`}
          animate={{ r: [68, 88, 68], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 3.4, repeat: reducedMotion ? 0 : Infinity, ease: "easeInOut" }}
        />
        <circle className={styles.closingPortalOuter} cx="450" cy="125" r="43" />
        <circle className={styles.closingPortalInner} cx="450" cy="125" r="28" filter={`url(#${uid}-closing-glow)`} />
        <path className={styles.closingCheck} d="m435 125 10 10 21-23" />
        <path className={styles.closingGate} d="M408 80v90M492 80v90" />

        {!reducedMotion
          ? incoming.map((path, index) => (
              <circle
                key={`closing-packet-${path}`}
                r={index === 0 ? 4 : 3}
                fill={["#34d9ff", "#9b79ff", "#4e8fff", "#49e2a8"][index]}
                filter={`url(#${uid}-closing-glow)`}
              >
                <animateMotion
                  dur={`${4.4 + index * 0.45}s`}
                  begin={`${index * -1.05}s`}
                  repeatCount="indefinite"
                  path={path}
                />
              </circle>
            ))
          : null}
        {!reducedMotion ? (
          <circle r="4" fill="#efffff" filter={`url(#${uid}-closing-glow)`}>
            <animateMotion dur="4.6s" repeatCount="indefinite" path="M492 125H866" />
          </circle>
        ) : null}
      </svg>
      <div className={styles.closingConvergenceLabels}>
        <span>distributed evidence</span>
        <span>verified outcome</span>
      </div>
    </div>
  );
}

export function ResearchSignal() {
  const reducedMotion = useReducedMotion();
  const rawId = useId();
  const uid = rawId.replaceAll(":", "");
  const path = "M88 142C198 66 286 210 410 136S640 76 744 142 936 220 1110 132";

  return (
    <Reveal className={styles.researchSignal}>
      <div className={styles.signalTopline}>
        <span>Executable research path</span>
        <span>Intent → evidence</span>
      </div>
      <svg
        viewBox="0 0 1200 285"
        role="img"
        aria-label="An animated research path carrying a circuit through planning, service execution, and a verified result"
      >
        <defs>
          <linearGradient id={`${uid}-research-path`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#34d9ff" />
            <stop offset="0.38" stopColor="#9b79ff" />
            <stop offset="0.72" stopColor="#4f9cff" />
            <stop offset="1" stopColor="#49e2a8" />
          </linearGradient>
          <filter id={`${uid}-research-glow`} x="-100%" y="-300%" width="300%" height="700%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className={styles.signalGrid}>
          {Array.from({ length: 13 }, (_, index) => (
            <line key={`research-v-${index}`} x1={index * 100} x2={index * 100} y1="0" y2="285" />
          ))}
          {Array.from({ length: 4 }, (_, index) => (
            <line key={`research-h-${index}`} x1="0" x2="1200" y1={index * 90} y2={index * 90} />
          ))}
        </g>

        <motion.path
          d={path}
          fill="none"
          stroke={`url(#${uid}-research-path)`}
          strokeWidth="2.5"
          strokeLinecap="round"
          filter={`url(#${uid}-research-glow)`}
          initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
        />

        {[
          { x: 88, y: 142, label: "INTENT", tone: "#34d9ff" },
          { x: 410, y: 136, label: "PLAN", tone: "#9b79ff" },
          { x: 744, y: 142, label: "FABRIC", tone: "#4f9cff" },
          { x: 1110, y: 132, label: "RESULT", tone: "#49e2a8" },
        ].map((node, index) => (
          <motion.g
            className={styles.researchNode}
            key={node.label}
            initial={reducedMotion ? false : { opacity: 0, scale: 0.7 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5, delay: 0.22 + index * 0.16 }}
          >
            <circle cx={node.x} cy={node.y} r="37" stroke={node.tone} />
            <circle cx={node.x} cy={node.y} r="21" stroke={node.tone} />
            <circle cx={node.x} cy={node.y} r="4" fill={node.tone} />
            <text x={node.x} y={node.y + 67} textAnchor="middle" fill={node.tone}>
              {node.label}
            </text>
          </motion.g>
        ))}

        {!reducedMotion
          ? [0, 1, 2].map((item) => (
              <circle
                key={item}
                r={item === 0 ? 5 : 3.2}
                fill="#f1fdff"
                filter={`url(#${uid}-research-glow)`}
              >
                <animateMotion
                  dur={`${5.5 + item * 0.8}s`}
                  begin={`${item * -1.7}s`}
                  repeatCount="indefinite"
                  path={path}
                />
              </circle>
            ))
          : null}
      </svg>
    </Reveal>
  );
}

export function RoadmapSignal() {
  const reducedMotion = useReducedMotion();
  const rawId = useId();
  const uid = rawId.replaceAll(":", "");
  const path = "M72 210C255 210 294 172 456 166S716 124 838 108 1018 66 1134 62";

  return (
    <Reveal className={styles.roadmapSignal}>
      <div className={styles.signalTopline}>
        <span>Delivery trajectory</span>
        <span>Repository-grounded scope</span>
      </div>
      <svg
        viewBox="0 0 1200 265"
        role="img"
        aria-label="An animated delivery trajectory from the available research stack through open network development to provider-scale orchestration"
      >
        <defs>
          <linearGradient id={`${uid}-roadmap-path`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#49e2a8" />
            <stop offset="0.55" stopColor="#4f9cff" />
            <stop offset="1" stopColor="#a07aff" />
          </linearGradient>
          <filter id={`${uid}-roadmap-glow`} x="-100%" y="-300%" width="300%" height="700%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className={styles.roadmapContours}>
          <path d="M72 228C255 228 294 190 456 184S716 142 838 126 1018 84 1134 80" />
          <path d="M72 192C255 192 294 154 456 148S716 106 838 90 1018 48 1134 44" />
        </g>

        <motion.path
          d={path}
          fill="none"
          stroke={`url(#${uid}-roadmap-path)`}
          strokeWidth="3"
          strokeLinecap="round"
          filter={`url(#${uid}-roadmap-glow)`}
          initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        />

        {[
          { x: 72, y: 210, label: "AVAILABLE", color: "#49e2a8" },
          { x: 456, y: 166, label: "IN DEVELOPMENT", color: "#4f9cff" },
          { x: 838, y: 108, label: "RESEARCH", color: "#7d8cff" },
          { x: 1134, y: 62, label: "PROVIDER SCALE", color: "#a07aff" },
        ].map((node, index) => (
          <motion.g
            className={styles.roadmapNode}
            key={node.label}
            initial={reducedMotion ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.45, delay: 0.2 + index * 0.14 }}
          >
            <circle cx={node.x} cy={node.y} r="13" fill="#030814" stroke={node.color} />
            <circle cx={node.x} cy={node.y} r="4" fill={node.color} />
            <line x1={node.x} x2={node.x} y1={node.y + 14} y2="245" stroke={node.color} />
            <text x={node.x} y="258" textAnchor="middle" fill={node.color}>
              {node.label}
            </text>
          </motion.g>
        ))}

        {!reducedMotion ? (
          <circle r="5" fill="#f4fdff" filter={`url(#${uid}-roadmap-glow)`}>
            <animateMotion dur="6.2s" repeatCount="indefinite" path={path} />
          </circle>
        ) : null}
      </svg>
    </Reveal>
  );
}
