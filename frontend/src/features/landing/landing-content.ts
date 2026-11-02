import { EXTERNAL_LINKS, ROUTES } from "@/constants";

export const REPOSITORY_URL = EXTERNAL_LINKS.REPOSITORY;
export const RESEARCH_URL = EXTERNAL_LINKS.RESEARCH_PAPER;
export const DEMO_URL = EXTERNAL_LINKS.DEMO_VIDEO;
const DOCS = EXTERNAL_LINKS.DOCS;
export const CONSOLE_HREF = `${ROUTES.SIGNIN}?next=${ROUTES.DASHBOARD}`;

export const NAV = {
  links: [
    { label: "Architecture", href: "#architecture" },
    { label: "Workloads", href: "#workloads" },
    { label: "Results", href: "#results" },
    { label: "Developers", href: "#developers" },
    { label: "Team", href: "#team" },
  ],
  secondary: "GitHub",
  primary: "Open the console",
  menu: { open: "Open menu", close: "Close menu" },
} as const;

export const HERO = {
  title: ["Quantum, run", "as a network"],
  body: "Split quantum circuits across a peer-to-peer mesh of ordinary devices, pay each peer per request, and get a receipt for every result.",
  muted: "Simulated qubits on real network infrastructure.",
  primary: "Watch the demo",
  secondary: "Open the console",
  ribbon: "Runs on anything that runs Python",
  sceneCaption:
    "Six spare devices across the world, one machine · illustrative locations, simulated qubits",
  scene:
    "Isometric world map with six floating peers pinned over San Francisco, São Paulo, Cape Town, London, Mumbai and Tokyo: a laptop, an old phone, a Raspberry Pi cluster, an old CRT desktop, a Raspberry Pi and a mini PC, linked by arcs over the map. Circuit fragments arc down from one large qubit sphere to each peer, a small qubit above each one evolves and is measured, and the bits arc back up into the sphere: the mesh acting as one machine, with a receipt for the result.",
} as const;

export const GLYPHS = {
  label:
    "A drifting field of 0 and 1 characters in diagonal bands; moving the pointer brightens a short trail.",
} as const;

export const BUILT_ON = {
  label: "Infrastructure behind QMesh",
  short: "Built on",
  pause: "Pause motion",
  resume: "Resume motion",
  rowLabels: ["Network and execution", "Services and integrations"],
  rows: [
    [
      { name: "py-libp2p", role: "Peer networking" },
      { name: "Qiskit", role: "Quantum simulation" },
      { name: "PennyLane", role: "Quantum workflows" },
      { name: "IPFS", role: "Content addressing" },
      { name: "Helia", role: "Browser vault" },
      { name: "Kubo", role: "Platform content node" },
      { name: "Algorand x402", role: "Per-request payments" },
      { name: "Ethereum Sepolia", role: "Provenance anchoring" },
      { name: "Base Sepolia", role: "Wallet transactions" },
      { name: "Starknet Sepolia", role: "Spending policies" },
    ],
    [
      { name: "Chainlink", role: "Verifiable price feeds" },
      { name: "Robinhood Chain", role: "Tokenized stock data" },
      { name: "ENS", role: "Name resolution" },
      { name: "Coinbase CDP", role: "Agent wallets" },
      { name: "Stripe", role: "Subscriptions and credits" },
      { name: "NEAR AI Cloud", role: "Private inference" },
      { name: "Groq", role: "Agent inference" },
      { name: "OpenRouter", role: "Model routing" },
      { name: "Lighthouse", role: "Vault pinning" },
      { name: "Toju", role: "Approved storage exports" },
    ],
  ],
} as const;

export interface Layer {
  key: "app" | "coordinator" | "payments" | "mesh" | "provenance";
  name: string;
  title: string;
  body: string;
  /** One label per component on the plate, in the order the plate draws its anchors. */
  callouts: readonly string[];
}

export const ARCHITECTURE: {
  title: [string, string];
  body: string;
  layers: ReadonlyArray<Layer>;
} = {
  title: ["Quantum infrastructure built in", "layers"],
  body: "One coordinator, a mesh of ordinary devices, a payment per request and a receipt for every result.",
  layers: [
    {
      key: "app",
      name: "Your app",
      title: "Submit",
      body: "Send OpenQASM from the console or the API, and get a receipt back.",
      callouts: [
        "Operator console",
        "Job status",
        "OpenQASM editor",
        "REST API",
      ],
    },
    {
      key: "coordinator",
      name: "Coordinator",
      title: "Plan",
      body: "The coordinator turns each circuit into a distributed execution plan.",
      callouts: [
        "Coordinator",
        "Execution plan",
        "Circuit fragments",
        "Peer reservation",
      ],
    },
    {
      key: "payments",
      name: "Payments and registry",
      title: "Pay",
      body: "Every run pays its peers per request, in Algorand USDC on TestNet.",
      callouts: ["USDC on Algorand", "x402 receipt", "Chain registry"],
    },
    {
      key: "mesh",
      name: "Peer mesh",
      title: "Run",
      body: "Worker peers on py-libp2p run their fragments with Qiskit.",
      callouts: [
        "Laptop",
        "Raspberry Pi",
        "Old desktop",
        "Old phone",
        "Mini PC",
        "libp2p links",
      ],
    },
    {
      key: "provenance",
      name: "Provenance",
      title: "Prove",
      body: "Every result becomes a provenance bundle, pinned on IPFS by content.",
      callouts: [
        "Merkle root",
        "Branch hashes",
        "Result bundles",
        "Pinned by CID",
      ],
    },
  ],
};

export interface Workload {
  title: string;
  body: string;
  points: readonly [string, string, string];
  status: "Available" | "In review" | "Experimental";
  href: string;
  action: string;
  api: string;
  /** The animated diagram drawn for this workload. */
  visual: "circuit" | "frontier" | "histogram" | "chain" | "molecule";
  /** One measured or documented fact; never invented. */
  fact: string;
}

export const WORKLOADS: { title: string; items: ReadonlyArray<Workload> } = {
  title: "Designed for real workloads",
  items: [
    {
      title: "Distributed circuits",
      body: "Normalize OpenQASM, plan fragments and execute them across worker peers, with every fallback recorded.",
      points: ["OpenQASM in", "Fragments over libp2p", "Qiskit statevector"],
      status: "Available",
      href: CONSOLE_HREF,
      action: "Run a circuit",
      api: `POST /api/x402/quantum/runs
{ "circuit": "OPENQASM 2.0; include \\"qelib1.inc\\"; qreg q[2]; creg c[2]; h q[0]; cx q[0],q[1]; measure q -> c;" }`,
      visual: "circuit",
      fact: "Paid circuit runs completed on Algorand TestNet",
    },
    {
      title: "Portfolio optimization",
      body: "QAOA benchmarked against classical baselines, with every measured state and coupling inspectable.",
      points: ["QAOA vs classical", "Bloch state per asset", "Ising couplings"],
      status: "Available",
      href: RESEARCH_URL,
      action: "Read the benchmark",
      api: `POST /benchmark/portfolio
{ "max_assets": 10, "risk_aversion": 0.5 }`,
      visual: "frontier",
      fact: "3.2× faster at 40 assets, 9.5× at 60 (research draft)",
    },
    {
      title: "Risk and option pricing",
      body: "VaR, CVaR, credit-risk and option-pricing experiments run beside their classical methods.",
      points: ["VaR and CVaR", "Credit risk", "QAE option pricing over x402"],
      status: "Available",
      href: DOCS.BACKEND,
      action: "Backend docs",
      api: `POST /api/x402/options/runs
→ 402 Payment Required (Algorand USDC, TestNet)`,
      visual: "histogram",
      fact: "Paid options runs completed on Algorand TestNet",
    },
    {
      title: "Provenance anchoring",
      body: "Batches of provenance bundles become one Merkle root in a single Ethereum Sepolia transaction.",
      points: [
        "Bundles pinned on IPFS",
        "One root per batch",
        "Counted once final",
      ],
      status: "In review",
      href: DOCS.PROVENANCE,
      action: "Provenance docs",
      api: `provenance bundle → IPFS (CID) → Merkle root → Sepolia tx`,
      visual: "chain",
      fact: "≈22.7k gas for one anchor batch on Sepolia",
    },
    {
      title: "Drug-discovery pipeline",
      body: "Molecular filters with simulated quantum stages, for early research only.",
      points: [
        "Molecular filters",
        "Simulated quantum stages",
        "ADMET heuristics",
      ],
      status: "Experimental",
      href: DOCS.OVERVIEW,
      action: "Overview",
      api: `POST /api/v1/pharma/submit
→ 202 Accepted { "job_id", "status", "submitted_at" }`,
      visual: "molecule",
      fact: "Experimental: simulated quantum stages, research only",
    },
  ],
};

export const RESULTS = {
  title: "Results you can check",
  action: "Watch the demo",
  /** The scroll story, told like giga.ai's Build → Observe → Improve, with QMesh's own content. */
  story: {
    label:
      "Scroll story. Mesh: strands from laptops, Raspberry Pis and old phones converge into one machine. Run: the machine bursts into a field of fragments that cluster by workload, then line up by workload over time. Scale: they settle on a chart where QAOA on the mesh climbs from parity at 20 assets to 3.2 times faster at 40 and 9.5 times faster at 60.",
    sources: ["Laptops", "Raspberry Pis", "Old phones"],
    point: "One machine",
    pointLoop: "One machine, next run",
    phases: [
      {
        key: "mesh",
        title: "Mesh.",
        body: "Bring spare devices together into one machine.",
      },
      {
        key: "run",
        title: "Run.",
        body: "See every fragment as it runs across the mesh.",
      },
      {
        key: "scale",
        title: "Scale.",
        body: "Where QAOA on the mesh overtakes classical search.",
      },
    ],
    loop: {
      title: "Then the mesh runs again.",
      body: "Same devices, next circuit.",
    },
    rows: ["Circuits", "Portfolios", "Risk & options", "Anchoring", "Pharma"],
    runAxis: ["Earlier", "Recent"],
    runNote: "Illustrative",
    chart: {
      baselineLabel: "Speedup over classical",
      marker: "Classical wins up to 20 assets",
      gain: "Gain",
      current: "Classical",
      points: [
        { assets: 40, speedup: 3.2, label: "3.2× at 40 assets" },
        { assets: 60, speedup: 9.5, label: "9.5× at 60 assets" },
      ],
      note: "Measured at 40 and 60 assets; the curve between is illustrative.",
    },
    action: "Read the paper",
  },
  stats: [
    {
      value: "97",
      suffix: "%",
      title: "Run time in classical search",
      body: "Most of a QAOA run is COBYLA parameter search, not the circuit.",
    },
    {
      value: "1.03",
      suffix: "×",
      title: "Ceiling from more nodes",
      body: "Amdahl's law caps what extra quantum peers can add to one run.",
    },
    {
      value: "3.2",
      suffix: "×",
      title: "Faster at 40 assets",
      body: "Where QAOA first overtakes the classical baseline.",
    },
    {
      value: "9.5",
      suffix: "×",
      title: "Faster at 60 assets",
      body: "The gap widens as the problem grows.",
    },
  ],
  footnote:
    "Simulator benchmarks from the QMesh research draft. QMesh runs on Qiskit statevector simulation, not quantum hardware.",
} as const;

/** A run's receipt, printed line by line on scroll. Every line is a real step in the codebase. */
export const RECEIPT = {
  title: ["Every result leaves", "a receipt."],
  body: "Each run records what was asked, how it was paid, where it ran and how to check it, then pins that record where anyone can fetch it.",
  counterLabel: "Events on one receipt",
  chip: "Pinned by CID",
  head: ["Receipt", "Example job"],
  groups: [
    {
      name: "01 Request",
      tag: "x402",
      lines: [
        ["Submit OpenQASM circuit", "2 qubits"],
        ["402 Payment Required", "x402"],
        ["Pay in USDC", "Algorand TestNet"],
      ],
    },
    {
      name: "02 Plan",
      tag: "Coordinator",
      lines: [
        ["Normalize the circuit", "QASM"],
        ["Build the execution plan", "Fragments"],
        ["Reserve peer capacity", "libp2p"],
      ],
    },
    {
      name: "03 Run",
      tag: "Peers",
      lines: [
        ["Send fragments over streams", "libp2p"],
        ["Statevector simulation", "Qiskit"],
        ["Measure and assemble", "Result"],
      ],
    },
    {
      name: "04 Prove",
      tag: "Provenance",
      lines: [
        ["Hash inputs, plan and results", "Bundle"],
        ["Pin the bundle to IPFS", "CID"],
        ["Fetch by CID, hashes match", "Verified"],
        ["Merkle anchor on Sepolia", "In review"],
      ],
    },
  ],
} as const;

const tree = (path: string) => `${REPOSITORY_URL}/tree/main/${path}`;
const blob = (path: string) => `${REPOSITORY_URL}/blob/main/${path}`;

export interface RepoPart {
  key: string;
  title: string;
  body: string;
  path: string;
  href: string;
  /** The command or entry point you would actually use. */
  run: string;
  group: "Platform" | "Trust" | "Research";
}

/** What's in the repository, mapped to real paths (verified against the repo). */
export const REPO = {
  title: "What's in the repository",
  body: "One open-source monorepo: the console, the coordinator, the peers, and the payment and provenance layers they share.",
  github: "View on GitHub",
  parts: [
    {
      key: "console",
      group: "Platform",
      title: "Operator console",
      body: "Peers, jobs and quantum analysis, live.",
      path: "frontend/src/features/dashboard",
      href: tree("frontend/src/features/dashboard"),
      run: "cd frontend && bun run dev",
    },
    {
      key: "coordinator",
      group: "Platform",
      title: "Coordinator API",
      body: "FastAPI service that plans circuits and routes fragments.",
      path: "backend/src/quantum_backend_v2/api",
      href: tree("backend/src/quantum_backend_v2/api"),
      run: "cd backend && make run",
    },
    {
      key: "peers",
      group: "Platform",
      title: "Worker peers",
      body: "py-libp2p processes that run fragments with Qiskit.",
      path: "scripts/node-starter-template.py",
      href: blob("scripts/node-starter-template.py"),
      run: "python scripts/node-starter-template.py --coordinator <MULTIADDR> --label my-node",
    },
    {
      key: "registry",
      group: "Platform",
      title: "Chain registry",
      body: "Testnet metadata behind one reviewed file.",
      path: "backend/src/quantum_backend_v2/chains/registry.toml",
      href: blob("backend/src/quantum_backend_v2/chains/registry.toml"),
      run: "GET /api/v1/chains",
    },
    {
      key: "x402",
      group: "Trust",
      title: "x402 payments",
      body: "Pay per request in Algorand USDC on TestNet.",
      path: "frontend/src/features/x402",
      href: tree("frontend/src/features/x402"),
      run: "POST /api/x402/quantum/runs",
    },
    {
      key: "provenance",
      group: "Trust",
      title: "Provenance bundles",
      body: "Hashed inputs, plan and results for every run.",
      path: "backend/src/quantum_backend_v2/provenance",
      href: tree("backend/src/quantum_backend_v2/provenance"),
      run: "GET /api/v1/provenance/{bundle_id}/verify",
    },
    {
      key: "benchmarks",
      group: "Research",
      title: "Benchmarks",
      body: "QAOA against classical, on public datasets.",
      path: "backend/scripts",
      href: tree("backend/scripts"),
      run: "python backend/scripts/benchmark_massive_dataset.py",
    },
    {
      key: "paper",
      group: "Research",
      title: "Research paper",
      body: "The analysis behind every number on this page.",
      path: "QMeshPy/documentations · research/RESEARCH_PAPER_DRAFT.md",
      href: RESEARCH_URL,
      run: "Read the draft",
    },
  ] satisfies ReadonlyArray<RepoPart>,
} as const;

/** Start building: three ways in, each one real command. */
export const START = {
  title: "Start building today",
  body: "Call the mesh, run it yourself, or add a device to it. Every command below is from the repository.",
  paths: [
    {
      key: "call",
      title: "Call it",
      body: "Submit a circuit to the paid route. It answers 402 until the run is paid in Algorand USDC.",
      command: `curl -X POST "$QMESH/api/x402/quantum/runs" -H "Content-Type: application/json" -d '{"circuit": "OPENQASM 2.0; …"}'`,
      steps: [
        "POST /api/x402/quantum/runs",
        "402 Payment Required",
        "Pay in USDC · Algorand TestNet",
        "201 Created { job_id, status }",
      ],
      href: DOCS.X402,
      action: "x402 docs",
    },
    {
      key: "run",
      title: "Run it",
      body: "Bring up the coordinator and the console locally, from a clone of the repository.",
      command: "cd backend && make run\ncd frontend && bun run dev",
      steps: [
        "Clone the repository",
        "make run (coordinator)",
        "bun run dev (console)",
        "Open the console",
      ],
      href: DOCS.BACKEND,
      action: "Backend README",
    },
    {
      key: "power",
      title: "Power it",
      body: "Turn a spare machine into a worker peer that joins the mesh and runs fragments.",
      command:
        "python scripts/node-starter-template.py --coordinator <MULTIADDR> --label my-node",
      steps: [
        "Point at a coordinator",
        "Peer joins over libp2p",
        "Advertises what it can run",
        "Receives fragments",
      ],
      href: blob("scripts/node-starter-template.py"),
      action: "View the script",
    },
  ],
  footer: ["Plain REST", "Machine-payable", "Apache 2.0", "Testnets only"],
} as const;

export interface TeamMember {
  name: string;
  role: string;
  /** GitHub login; omitted when it is not known for certain. */
  github?: string;
  /** Profile photo URL (a file in /public, e.g. "/team/soham.jpg"); the pixel identicon shows until it is set. */
  photo?: string;
  /** Profile links; each icon stays a dimmed placeholder until its URL is filled in. */
  x?: string;
  linkedin?: string;
  website?: string;
}

// Seeded from the repository's commit history. Edit roles and add people here.
export const TEAM: {
  title: string;
  body: string;
  members: ReadonlyArray<TeamMember>;
} = {
  title: "The people building the mesh",
  body: "QMesh is built in the open by its founders and contributors.",
  members: [
    { name: "Soham Bhoir", role: "Co-founder", github: "Winter-Soren" },
    {
      name: "Johana Moran",
      role: "Co-founder",
      linkedin: "https://www.linkedin.com/in/johanna-moran-46580610/",
    },
    {
      name: "Manu Sheel Gupta",
      role: "Co-founder",
      github: "seetadev",
      x: "https://x.com/manusheel",
    },
    { name: "Harshal Dulera", role: "Contributor", github: "harshaldulera" },
    {
      name: "Gaurish Baliga",
      role: "Contributor",
      x: "https://x.com/gaurishcodes",
      linkedin: "https://www.linkedin.com/in/gaurish-baliga-443894131/",
    },
    {
      name: "Saish Korgaonkar",
      role: "Contributor",
      github: "SaishKorgaonkar",
      x: "https://x.com/saishh_k",
      linkedin: "https://www.linkedin.com/in/saish-korgaonkar/",
      website: "https://saish.xyz/",
    },
    {
      name: "Ishika Bhoyar",
      role: "Contributor",
      github: "ishikabhoyar",
      x: "https://x.com/IshikaBhoyar",
      linkedin: "https://www.linkedin.com/in/ishikabhoyar/",
    },
    {
      name: "Arnab Bhowmik",
      role: "Contributor",
      github: "Arnab-Afk",
      x: "https://x.com/bhowmik_arnab07",
      linkedin: "https://www.linkedin.com/in/bhowmikarnab/",
      website: "https://arnabbhowmik.in/",
    },
    { name: "Neha Kumari", role: "Contributor", github: "Nkovaturient" },
    { name: "Vinay Sitaram Kanse", role: "Contributor", github: "vinayskanse" },
    { name: "Kritarth Shankar", role: "Contributor", github: "kodykebab" },
  ],
};

export const FAQ = {
  title: "Questions, answered plainly",
  items: [
    {
      question: "Does QMesh run on quantum hardware?",
      answer:
        "No. Circuits run on Qiskit statevector simulation across worker peers. The network, payments and provenance are real; the qubits are simulated.",
    },
    {
      question: "What is a peer?",
      answer:
        "A process that advertises quantum services over libp2p. The coordinator discovers peers, reserves capacity on them and sends them circuit fragments.",
    },
    {
      question: "How do I know a result wasn't changed?",
      answer:
        "Each run produces a provenance bundle that hashes its inputs, plan and results. You can re-check it locally and fetch it from IPFS by CID.",
    },
    {
      question: "Does it touch real money or mainnet?",
      answer:
        "No. Every chain QMesh writes to is a testnet. Robinhood Chain price feeds are only read, never traded.",
    },
    {
      question: "Is it open source?",
      answer:
        "Yes. The coordinator, workers, console and contracts are on GitHub under Apache 2.0.",
    },
  ],
} as const;

export const CLOSING = {
  title: "Run your first circuit across the mesh.",
  primary: "Open the console",
} as const;

export const FOOTER = {
  blurb:
    "Quantum computation as discoverable, payable and verifiable network services.",
  scope:
    "Open-source research platform. Simulated qubits, real network, testnets only.",
  columns: [
    {
      title: "Product",
      links: [
        { label: "Operator console", href: CONSOLE_HREF },
        { label: "Demo video", href: DEMO_URL },
        { label: "Architecture", href: "#architecture" },
      ],
    },
    {
      title: "Developers",
      links: [
        { label: "Repository", href: REPOSITORY_URL },
        { label: "Backend", href: DOCS.BACKEND },
        { label: "x402", href: DOCS.X402 },
        { label: "Chain registry", href: DOCS.CHAIN_REGISTRY },
      ],
    },
    {
      title: "Research",
      links: [
        { label: "Research paper", href: RESEARCH_URL },
        { label: "Provenance", href: DOCS.PROVENANCE },
        { label: "Overview", href: DOCS.OVERVIEW },
      ],
    },
  ],
  wordmark: "QMesh",
  copy: "© 2026 QMesh. Open source under Apache 2.0.",
} as const;
