import type { LucideIcon } from "lucide-react";
import {
  Atom,
  Bot,
  Braces,
  Boxes,
  CircleGauge,
  FlaskConical,
  GitBranch,
  Network,
  Orbit,
  Route,
  ShieldCheck,
  TrendingUp,
  Waypoints,
} from "lucide-react";

export const REPOSITORY_URL =
  "https://github.com/QMeshPy/distributed-quantum";

export const LOCAL_SETUP_COMMAND = `cd frontend
bun install
bun run dev`;

export type DeliveryState =
  | "Available"
  | "In development"
  | "Research direction"
  | "Long-term";

export interface UseCase {
  number: string;
  title: string;
  description: string;
  outcome: string;
  status: DeliveryState;
  href: string;
  icon: LucideIcon;
}

export const USE_CASES: UseCase[] = [
  {
    number: "01",
    title: "Financial modelling benchmarks",
    description:
      "Upload portfolio data for a QAOA benchmark, inspect its efficient frontier, and compare the result with classical optimization baselines.",
    outcome: "Research benchmark · local portfolio diagnostics",
    status: "Available",
    href: "/signin?next=/finance",
    icon: CircleGauge,
  },
  {
    number: "02",
    title: "Risk & options",
    description:
      "Compare simulator-based VaR, CVaR, equity-risk, credit-risk, and options-pricing experiments with classical baselines.",
    outcome: "Available research tools · simulated comparisons",
    status: "Available",
    href: "/signin?next=/risk",
    icon: TrendingUp,
  },
  {
    number: "03",
    title: "Experimental molecular workflows",
    description:
      "Configure a target and seed ligand for a drug-discovery research pipeline combining molecular filters with simulated quantum stages and ADMET heuristics.",
    outcome: "Experimental MVP · not validated drug discovery",
    status: "In development",
    href: "/signin?next=/pharma/submit",
    icon: FlaskConical,
  },
  {
    number: "04",
    title: "Circuit orchestration",
    description:
      "Normalize OpenQASM, preserve dependencies, reserve services, execute distributed fragments, and inspect every fallback.",
    outcome: "Live surface · plans, attempts, and results",
    status: "Available",
    href: "/signin?next=/runs/new",
    icon: Route,
  },
  {
    number: "05",
    title: "Agentic research",
    description:
      "Experiment with AI-assisted proposal analysis, marketplace discovery, conversations, reputation, and funding workflows.",
    outcome: "Experimental · agent tool execution is not live",
    status: "In development",
    href: "/signin?next=/agents",
    icon: Bot,
  },
  {
    number: "06",
    title: "Content-addressed circuit vault",
    description:
      "Save, inspect, share by CID, and optionally pin browser-managed quantum circuits and run payloads.",
    outcome: "Experimental · content-addressed sharing and pinning",
    status: "In development",
    href: "/signin?next=/vault/circuits",
    icon: Braces,
  },
];

export interface ArchitectureLayer {
  index: string;
  label: string;
  detail: string;
  technology: string;
}

export const ARCHITECTURE_LAYERS: ArchitectureLayer[] = [
  {
    index: "01",
    label: "Workload inputs",
    detail: "OpenQASM circuits and domain workflow requests enter through REST interfaces.",
    technology: "Next.js · FastAPI",
  },
  {
    index: "02",
    label: "Normalize + compose",
    detail: "The coordinator parses operations, preserves dependencies, and forms executable fragments.",
    technology: "Parser · DAG builder",
  },
  {
    index: "03",
    label: "Discover + plan",
    detail: "Published service capabilities are filtered and ranked into primary and fallback assignments.",
    technology: "py-libp2p · Cost planner",
  },
  {
    index: "04",
    label: "Reserve + dispatch",
    detail: "Capacity is reserved before fragment execution, with bounded retries and policy-driven fallback.",
    technology: "Prepare · Commit · Cancel",
  },
  {
    index: "05",
    label: "Execute + interpret",
    detail: "Embedded worker peers apply circuit fragments and the coordinator assembles simulation results.",
    technology: "Qiskit statevector",
  },
  {
    index: "06",
    label: "Observe + persist",
    detail: "Events, projections, and operator views make plans and runtime transitions inspectable.",
    technology: "Postgres · MongoDB · JSONL",
  },
];

export interface CapabilityNode {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  proof: string;
  icon: LucideIcon;
  tone: "cyan" | "indigo" | "violet" | "emerald";
}

export const CAPABILITY_NODES: CapabilityNode[] = [
  {
    id: "discovery",
    label: "Service discovery",
    shortLabel: "Discover",
    description:
      "Peer advertisements expose service IDs, health, addresses, protocols, and capability summaries.",
    proof: "GossipSub advertisements feed the coordinator's registry.",
    icon: Network,
    tone: "cyan",
  },
  {
    id: "planning",
    label: "Deterministic planning",
    shortLabel: "Plan",
    description:
      "Circuit operations become dependency-aware fragments ordered topologically before assignment.",
    proof: "The planner records primary and fallback candidates for every fragment.",
    icon: GitBranch,
    tone: "indigo",
  },
  {
    id: "reservation",
    label: "Capacity reservation",
    shortLabel: "Reserve",
    description:
      "Prepare, commit, and cancel transitions coordinate capacity before execution begins.",
    proof: "Rejected or expired reservations do not silently enter execution.",
    icon: ShieldCheck,
    tone: "emerald",
  },
  {
    id: "routing",
    label: "Fallback routing",
    shortLabel: "Fallback",
    description:
      "Timeouts, connection loss, rejected work, and degraded quality can advance to the next candidate.",
    proof: "Retries are bounded and each transition is recorded as an event.",
    icon: Waypoints,
    tone: "violet",
  },
  {
    id: "services",
    label: "Quantum gate services",
    shortLabel: "Execute",
    description:
      "The local catalog includes Hadamard, CNOT, CZ, QFT, programmable gates, and related service types.",
    proof: "Development mode runs these services on embedded worker peers.",
    icon: Atom,
    tone: "cyan",
  },
  {
    id: "results",
    label: "Result interpretation",
    shortLabel: "Interpret",
    description:
      "Fragment state handoffs are assembled into a final simulation result with runtime provenance.",
    proof: "The current execution target is Qiskit statevector simulation.",
    icon: Orbit,
    tone: "indigo",
  },
];

export interface RoadmapGroup {
  state: DeliveryState;
  summary: string;
  items: string[];
}

export const ROADMAP_GROUPS: RoadmapGroup[] = [
  {
    state: "Available",
    summary: "Runnable in the local research stack today.",
    items: [
      "OpenQASM normalization and dependency-aware planning",
      "Real py-libp2p transport with embedded worker peers",
      "Reservation, bounded retry, and fallback execution",
      "Qiskit statevector interpretation and operator console",
    ],
  },
  {
    state: "In development",
    summary: "Code exists, but operational completeness still depends on configuration, testing, or infrastructure.",
    items: [
      "External community-worker onboarding",
      "Browser vault persistence and optional pinning",
      "Experimental molecular workflow surfaces",
      "Production SDK, auth, and formal benchmark harness",
    ],
  },
  {
    state: "Research direction",
    summary: "Investigations documented in the repository, not current product claims.",
    items: [
      "Provider adapters for real quantum hardware",
      "Multi-domain scientific workflow composition",
      "Quantum amplitude-estimation experiments",
      "Verifiable, content-addressed research packages",
    ],
  },
  {
    state: "Long-term",
    summary: "Architecture proposals that require major distributed-systems work.",
    items: [
      "Multi-coordinator operation and federation",
      "Open bring-your-own-node service marketplace",
      "Torrent-native service distribution",
      "Self-healing Hydra-style network coordination",
    ],
  },
];

export const HERO_SIGNALS = [
  { label: "Transport", value: "py-libp2p" },
  { label: "Execution", value: "Qiskit simulation" },
  { label: "Planning", value: "DAG + fallbacks" },
  { label: "License", value: "MIT" },
] as const;

export const WORKFLOW_STEPS = [
  {
    id: "discover",
    number: "01",
    title: "Discover capabilities",
    description:
      "The coordinator receives peer advertisements and builds a queryable view of healthy services, protocols, and capacity.",
    detail: "Registry snapshot · service filters · health signals",
    icon: Network,
  },
  {
    id: "compose",
    number: "02",
    title: "Compose a plan",
    description:
      "Circuit dependencies become ordered fragments. Candidate services are scored, then assigned as primary and fallback routes.",
    detail: "Normalize · fragment · topological order · rank",
    icon: Boxes,
  },
  {
    id: "execute",
    number: "03",
    title: "Execute with recovery",
    description:
      "The runtime reserves capacity, dispatches fragments, records attempts, and advances to a fallback when policy allows.",
    detail: "Reserve · dispatch · retry · interpret",
    icon: Orbit,
  },
] as const;
