"use client";

import Link from "next/link";
import { ROUTES } from "@/constants";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import {
  Atom,
  Beaker,
  ChartLine,
  Globe,
  Cpu,
  Network,
  ShieldCheck,
  Zap,
  ArrowRight,
  FlaskConical,
  TrendingUp,
  FileCode2,
  Sparkles,
} from "lucide-react";
import { Spotlight } from "./components/spotlight";
import { TextReveal, FadeUp } from "./components/text-reveal";
import { AnimatedBeam } from "./components/animated-beam";
import { GlowingStars } from "./components/glowing-stars";
import { HoverCard } from "./components/hover-card-effect";
import { Typewriter } from "./components/typewriter";
import { MovingBorder } from "./components/moving-border";
import { Meteors } from "./components/meteors";
import { GridBackground, DotBackground } from "./components/grid-background";
import { AnimatedCounter } from "./components/counter";

function NavBar() {
  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
      className="fixed top-0 inset-x-0 z-50 flex h-16 items-center justify-between px-6 md:px-12 backdrop-blur-xl border-b border-white/[0.06] bg-background/60"
    >
      <div className="flex items-center gap-2">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        >
          <Atom className="h-6 w-6 text-primary" />
        </motion.div>
        <span className="text-lg font-medium text-ink">QuantumLab</span>
      </div>
      <div className="hidden md:flex items-center gap-8 text-sm text-body">
        {["Domains", "Architecture", "Features", "Research"].map((item) => (
          <a
            key={item}
            href={`#${item.toLowerCase()}`}
            className="relative hover:text-ink transition-colors cursor-pointer group"
          >
            {item}
            <span className="absolute -bottom-1 left-0 h-px w-0 bg-primary transition-all duration-300 group-hover:w-full" />
          </a>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Link
          href={ROUTES.SIGNIN}
          className="text-sm text-body hover:text-ink transition-colors cursor-pointer"
        >
          Sign in
        </Link>
        <Link
          href={ROUTES.SIGNUP}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-all hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] cursor-pointer"
        >
          Get Started
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </motion.nav>
  );
}

function HeroSection() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <Spotlight className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <section ref={ref} className="relative w-full pt-32 pb-24 md:pt-40 md:pb-32">
        <GlowingStars />
        <AnimatedBeam />
        <GridBackground />

        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-primary/[0.04] blur-[150px]" />
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-[var(--glow-cyan-1)]/[0.03] blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] rounded-full bg-[var(--glow-violet-1)]/[0.03] blur-[100px]" />

        <motion.div style={{ y, opacity }} className="relative mx-auto max-w-5xl px-6 text-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-1.5 text-xs text-body mb-8 backdrop-blur-sm"
          >
            <Sparkles className="h-3 w-3 text-primary animate-glow" />
            Open-source autonomous research platform
          </motion.div>

          <TextReveal delay={0.3}>
            <h1 className="text-5xl md:text-7xl font-medium tracking-tight text-ink leading-[1.05]">
              Run quantum experiments
            </h1>
          </TextReveal>
          <TextReveal delay={0.5}>
            <h1 className="text-5xl md:text-7xl font-medium tracking-tight leading-[1.05] mt-2">
              <span className="gradient-text">across a peer-to-peer network</span>
            </h1>
          </TextReveal>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="mt-8 text-lg md:text-xl text-body max-w-2xl mx-auto leading-relaxed"
          >
            Four domains live:{" "}
            <Typewriter className="min-w-[200px] justify-center" />
            <br className="hidden sm:block" />
            Real libp2p. AI orchestration. IPFS-verifiable results.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <MovingBorder containerClassName="rounded-xl" className="px-6 py-3">
              <Link
                href={ROUTES.SIGNUP}
                className="inline-flex items-center gap-2 text-sm font-medium text-ink cursor-pointer"
              >
                Start Experimenting
                <ArrowRight className="h-4 w-4" />
              </Link>
            </MovingBorder>
            <motion.a
              href="#domains"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.04] px-6 py-3 text-sm font-medium text-ink hover:bg-white/[0.06] transition-colors cursor-pointer backdrop-blur-sm"
            >
              Explore Domains
            </motion.a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.3 }}
            className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-muted-foreground"
          >
            {[
              { icon: ShieldCheck, label: "Apache-2.0" },
              { icon: Globe, label: "py-libp2p P2P" },
              { icon: Cpu, label: "Qiskit Simulation" },
              { icon: Network, label: "IPFS Provenance" },
            ].map((item, i) => (
              <motion.span
                key={item.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.4 + i * 0.1 }}
                className="flex items-center gap-1.5"
              >
                <item.icon className="h-3.5 w-3.5" /> {item.label}
              </motion.span>
            ))}
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="h-8 w-5 rounded-full border border-white/20 flex justify-center pt-1.5"
          >
            <motion.div className="h-1.5 w-1 rounded-full bg-white/40" />
          </motion.div>
        </motion.div>
      </section>
    </Spotlight>
  );
}

const DOMAINS = [
  {
    icon: FlaskConical,
    title: "Drug Discovery",
    description:
      "6-stage quantum-assisted molecular pipeline: QWGAN generation, Lipinski filtering, VQE ground-state energy, DC-QAOA docking, VQC binding affinity, ADMET profiling.",
    color: "var(--glow-emerald-1)",
    tags: ["QWGAN", "VQE", "OpenFermion", "RDKit"],
  },
  {
    icon: TrendingUp,
    title: "Portfolio Optimization",
    description:
      "QAOA portfolio optimization vs classical Simulated Annealing with honest advantage analysis. Quantum advantage at N >= 40 assets.",
    color: "var(--glow-indigo-1)",
    tags: ["QAOA", "COBYLA", "Amdahl's Law"],
  },
  {
    icon: ChartLine,
    title: "Options Pricing",
    description:
      "Quantum Amplitude Estimation with documented 100x measurement reduction vs Monte Carlo. Novel QAE applied to molecular docking descriptors.",
    color: "var(--glow-cyan-1)",
    tags: ["QAE", "Monte Carlo", "100x shots"],
  },
  {
    icon: ShieldCheck,
    title: "Risk Analysis",
    description:
      "Quantum risk engine for credit VaR and equity holdings. Distributed compute across P2P network for large-scale simulations.",
    color: "var(--glow-rose-1)",
    tags: ["Credit VaR", "Equity", "Distributed"],
  },
];

function DomainsSection() {
  return (
    <section id="domains" className="relative py-24 md:py-32 overflow-hidden">
      <DotBackground />
      <div className="relative mx-auto max-w-6xl px-6">
        <div className="text-center mb-16">
          <FadeUp>
            <h2 className="text-3xl md:text-5xl font-medium text-ink">
              Four live scientific domains
            </h2>
          </FadeUp>
          <FadeUp delay={0.1}>
            <p className="mt-4 text-body max-w-xl mx-auto">
              End-to-end research pipelines running today. Not roadmap items —
              implemented, benchmarked, and ready to use.
            </p>
          </FadeUp>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {DOMAINS.map((domain, i) => (
            <FadeUp key={domain.title} delay={0.1 + i * 0.1}>
              <HoverCard>
                <div
                  className="inline-flex items-center justify-center h-10 w-10 rounded-lg mb-4"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${domain.color} 15%, transparent)`,
                  }}
                >
                  <domain.icon
                    className="h-5 w-5"
                    style={{ color: domain.color }}
                  />
                </div>
                <h3 className="text-lg font-medium text-ink">{domain.title}</h3>
                <p className="mt-2 text-sm text-body leading-relaxed">
                  {domain.description}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {domain.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </HoverCard>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

const ARCHITECTURE_LAYERS = [
  {
    icon: Beaker,
    layer: "Science",
    description: "Domain workflows across drug discovery, finance, options, and risk",
    tech: "RDKit, PennyLane, OpenFermion, PySCF, Qiskit",
  },
  {
    icon: Cpu,
    layer: "Orchestration",
    description: "OpenQASM ingest, DAG planning, reservation protocol, execution",
    tech: "FastAPI, Postgres, MongoDB, state machine",
  },
  {
    icon: Network,
    layer: "Compute Network",
    description: "Peer discovery, fragment dispatch, result assembly over real P2P",
    tech: "py-libp2p, GossipSub, Trio, Qiskit bridge",
  },
  {
    icon: Zap,
    layer: "AI Agents",
    description: "Intent classification, workflow orchestration, autonomous experiment loops",
    tech: "Anthropic Claude, AWS Bedrock, WebSocket",
  },
  {
    icon: Globe,
    layer: "Provenance",
    description: "Content-addressed circuits and results — verifiable, citable",
    tech: "Helia (browser IPFS), CID addressing",
  },
];

function ArchitectureSection() {
  return (
    <section
      id="architecture"
      className="relative py-24 md:py-32 border-t border-white/[0.06] overflow-hidden"
    >
      <AnimatedBeam />
      <div className="relative mx-auto max-w-5xl px-6">
        <div className="text-center mb-16">
          <FadeUp>
            <h2 className="text-3xl md:text-5xl font-medium text-ink">
              Five-layer architecture
            </h2>
          </FadeUp>
          <FadeUp delay={0.1}>
            <p className="mt-4 text-body max-w-xl mx-auto">
              From scientific workflows down to P2P transport — each layer
              composable and independently auditable.
            </p>
          </FadeUp>
        </div>

        <div className="space-y-4">
          {ARCHITECTURE_LAYERS.map((item, i) => (
            <FadeUp key={item.layer} delay={0.1 + i * 0.08}>
              <motion.div
                whileHover={{ x: 4, backgroundColor: "rgba(255,255,255,0.05)" }}
                transition={{ duration: 0.2 }}
                className="glass rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 cursor-default"
              >
                <div className="flex items-center gap-4 sm:w-56 shrink-0">
                  <span className="text-xs font-mono text-primary/60 w-4">
                    0{i + 1}
                  </span>
                  <item.icon className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium text-ink">
                    {item.layer}
                  </span>
                </div>
                <p className="text-sm text-body flex-1">{item.description}</p>
                <span className="text-xs text-muted-foreground font-mono sm:text-right shrink-0 opacity-60">
                  {item.tech}
                </span>
              </motion.div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    title: "Zero Setup",
    description:
      "Docker Compose up. Run experiments in minutes — no QPU access, no vendor lock-in, no environment battles.",
    icon: Zap,
  },
  {
    title: "Real P2P Transport",
    description:
      "Not simulated networks. Real py-libp2p with GossipSub advertisements and stream protocol execution.",
    icon: Network,
  },
  {
    title: "AI-Native Lab",
    description:
      "Describe your research goal in natural language. The AI agent selects domains, designs workflows, and drives execution.",
    icon: Sparkles,
  },
  {
    title: "IPFS Provenance",
    description:
      "Every circuit and result is a CID. Share, cite, and verify without trusting a central database.",
    icon: Globe,
  },
  {
    title: "Honest Benchmarks",
    description:
      "Amdahl's Law analysis included. 94-98% of VQE/QAOA runtime is classical optimization — we state this openly.",
    icon: ChartLine,
  },
  {
    title: "11 Gate Services",
    description:
      "Hadamard, CNOT, CZ, QFT, teleportation, Bell pair, syndrome extraction, and more available on the mesh.",
    icon: Cpu,
  },
];

function FeaturesSection() {
  return (
    <section
      id="features"
      className="relative py-24 md:py-32 border-t border-white/[0.06] overflow-hidden"
    >
      <GridBackground />
      <div className="relative mx-auto max-w-6xl px-6">
        <div className="text-center mb-16">
          <FadeUp>
            <h2 className="text-3xl md:text-5xl font-medium text-ink">
              Built for real research
            </h2>
          </FadeUp>
          <FadeUp delay={0.1}>
            <p className="mt-4 text-body max-w-xl mx-auto">
              Not a toy demo. A serious proof-of-concept with working pipelines,
              honest analysis, and open infrastructure.
            </p>
          </FadeUp>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature, i) => (
            <FadeUp key={feature.title} delay={0.05 + i * 0.08}>
              <HoverCard className="h-full">
                <feature.icon className="h-5 w-5 text-primary mb-3" />
                <h3 className="text-sm font-medium text-ink">{feature.title}</h3>
                <p className="mt-2 text-sm text-body leading-relaxed">
                  {feature.description}
                </p>
              </HoverCard>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

function ResearchSection() {
  return (
    <section
      id="research"
      className="relative py-24 md:py-32 border-t border-white/[0.06] overflow-hidden"
    >
      <Meteors count={15} />
      <div className="relative mx-auto max-w-4xl px-6">
        <FadeUp>
          <MovingBorder
            containerClassName="rounded-2xl"
            className="p-8 md:p-12"
            duration={6000}
          >
            <div className="flex items-center gap-3 mb-6">
              <FileCode2 className="h-5 w-5 text-primary" />
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Research Findings
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-medium text-ink">
              Honest quantum advantage analysis
            </h2>
            <div className="mt-6 space-y-4 text-sm text-body leading-relaxed">
              <p>
                Co-authored research (Bhoir, Gupta) documenting real performance
                characteristics — not hype, not overclaim.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
                <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-5 text-center">
                  <div className="text-3xl font-medium gradient-text">
                    <AnimatedCounter value={96} suffix="%" />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Classical optimizer time
                  </div>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-5 text-center">
                  <div className="text-3xl font-medium gradient-text">
                    <AnimatedCounter value={100} suffix="x" />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    QAE shot reduction
                  </div>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-5 text-center">
                  <div className="text-3xl font-medium gradient-text">
                    N<AnimatedCounter value={40} prefix="≥" />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    QAOA advantage threshold
                  </div>
                </div>
              </div>
            </div>
          </MovingBorder>
        </FadeUp>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="relative py-32 md:py-40 border-t border-white/[0.06] overflow-hidden">
      <GlowingStars className="opacity-50" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-primary/[0.06] blur-[150px]" />
      <div className="absolute top-1/4 right-1/3 w-[300px] h-[300px] rounded-full bg-[var(--glow-cyan-1)]/[0.04] blur-[120px]" />

      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <FadeUp>
          <h2 className="text-3xl md:text-5xl font-medium text-ink leading-tight">
            AI agents shouldn&apos;t call APIs.
          </h2>
        </FadeUp>
        <FadeUp delay={0.15}>
          <h2 className="text-3xl md:text-5xl font-medium leading-tight mt-2">
            <span className="gradient-text">They should join networks.</span>
          </h2>
        </FadeUp>
        <FadeUp delay={0.3}>
          <p className="mt-8 text-lg text-body max-w-xl mx-auto">
            Discover peers, reserve capacity, execute fragments, share results as
            CIDs. Open infrastructure for open science.
          </p>
        </FadeUp>
        <FadeUp delay={0.4}>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Link
                href={ROUTES.SIGNUP}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-sm font-medium text-primary-foreground hover:shadow-[0_0_30px_rgba(99,102,241,0.4)] transition-all cursor-pointer"
              >
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Link
                href={ROUTES.DASHBOARD}
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.04] px-7 py-3.5 text-sm font-medium text-ink hover:bg-white/[0.06] transition-colors cursor-pointer backdrop-blur-sm"
              >
                View Dashboard
              </Link>
            </motion.div>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.06] py-12">
      <div className="mx-auto max-w-6xl px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          >
            <Atom className="h-4 w-4 text-primary" />
          </motion.div>
          <span className="text-sm text-body">QuantumLab</span>
        </div>
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <span>Apache-2.0</span>
          <span>py-libp2p</span>
          <span>Qiskit Simulation</span>
          <span>Next.js 16</span>
        </div>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <HeroSection />
      <DomainsSection />
      <ArchitectureSection />
      <FeaturesSection />
      <ResearchSection />
      <CTASection />
      <Footer />
    </div>
  );
}
