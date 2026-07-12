import {
  ArrowRight,
  GitBranch,
  Network,
  ShieldCheck,
  Workflow,
} from "lucide-react";

import { REPOSITORY_URL } from "./landing-content";
import styles from "./landing-page.module.css";
import {
  ArchitectureAtlas,
  CapabilityExplorer,
  ClosingConvergence,
  LandingHeader,
  OrchestrationHero,
  ProblemFragmentation,
  ResearchSignal,
  Reveal,
  RoadmapSignal,
  RouteTrace,
  ScrollOrchestration,
} from "./components/landing-interactions";

const RESEARCH_PATHS = [
  {
    number: "01",
    title: "Circuit orchestration",
    body: "Normalize OpenQASM, preserve dependencies, rank service candidates, reserve capacity, and inspect every execution attempt.",
    icon: Workflow,
  },
  {
    number: "02",
    title: "Distributed service fabric",
    body: "Publish quantum capabilities over a peer-to-peer mesh and keep routing decisions explicit from discovery to result.",
    icon: Network,
  },
  {
    number: "03",
    title: "Verifiable research",
    body: "Keep plans, assignments, fallbacks, telemetry, and reproducible result artifacts attached to the workflow that produced them.",
    icon: ShieldCheck,
  },
] as const;

const ROADMAP = [
  {
    state: "Available",
    title: "Runnable research stack",
    body: "OpenQASM normalization, dependency-aware planning, libp2p transport, capacity reservation, bounded fallback, and Qiskit statevector execution.",
  },
  {
    state: "In development",
    title: "Open worker network",
    body: "External worker onboarding, durable artifact storage, richer operator controls, and a formal benchmark harness.",
  },
  {
    state: "Research direction",
    title: "Provider-scale orchestration",
    body: "Hardware adapters, multi-coordinator operation, federated discovery, and verifiable scientific workflow packages.",
  },
] as const;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.sectionLabel}>
      <span aria-hidden="true" />
      {children}
    </div>
  );
}

function HeroSection() {
  return (
    <section className={styles.hero} id="overview" aria-labelledby="hero-title">
      <div className={styles.heroCoordinates} aria-hidden="true">
        <span>A</span>
        <span>B</span>
        <span>C</span>
        <span>D</span>
      </div>

      <div className={styles.heroInner}>
        <Reveal className={styles.heroCopy}>
          <SectionLabel>Open-source orchestration layer</SectionLabel>
          <h1 id="hero-title">
            Quantum
            <br />
            services,
            <br />
            <span>orchestrated.</span>
          </h1>
          <p className={styles.heroLead}>
            DQS discovers, composes, and executes quantum circuit services across
            a peer-to-peer fabric. Open by design. Research-grade by default.
          </p>

          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="#architecture">
              Explore the architecture
              <ArrowRight aria-hidden="true" />
            </a>
            <a
              className={styles.secondaryAction}
              href={REPOSITORY_URL}
              target="_blank"
              rel="noreferrer"
            >
              <GitBranch aria-hidden="true" />
              View on GitHub
            </a>
          </div>

          <div className={styles.heroIndex} aria-hidden="true">
            <span>01</span>
            <i />
            <span>02</span>
            <i />
            <span>03</span>
            <i />
            <span>04</span>
          </div>
        </Reveal>

        <OrchestrationHero />
      </div>
    </section>
  );
}

function SystemProblemSection() {
  return (
    <section className={styles.problemSection} id="workflow">
      <div className={styles.sectionShell}>
        <Reveal className={styles.problemHeading}>
          <SectionLabel>The systems problem</SectionLabel>
          <h2>One circuit can cross many providers without losing its intent.</h2>
        </Reveal>

        <Reveal className={styles.problemCopy} delay={0.12}>
          <p>
            The hard part is not choosing a gate. It is coordinating discovery,
            dependencies, capacity, retries, provenance, and results as one
            inspectable system.
          </p>
          <a href="#orchestration-story">
            Follow the execution story
            <ArrowRight aria-hidden="true" />
          </a>
        </Reveal>
      </div>
      <ProblemFragmentation />
    </section>
  );
}

function ResearchSection() {
  return (
    <section className={styles.researchSection} id="research">
      <div className={styles.researchIntro}>
        <Reveal>
          <SectionLabel>Research surface</SectionLabel>
          <h2>Built to test orchestration ideas across real code paths.</h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p>
            DQS is deliberately transparent about what runs today, what is under
            active development, and what remains a research direction.
          </p>
        </Reveal>
      </div>

      <ResearchSignal />

      <div className={styles.researchList}>
        {RESEARCH_PATHS.map((item, index) => {
          const Icon = item.icon;
          return (
            <Reveal
              className={styles.researchRow}
              delay={index * 0.08}
              key={item.title}
            >
              <span className={styles.researchNumber}>{item.number}</span>
              <Icon className={styles.researchIcon} aria-hidden="true" />
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <ArrowRight aria-hidden="true" />
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

function RoadmapSection() {
  return (
    <section className={styles.roadmapSection} id="roadmap">
      <div className={styles.roadmapIntro}>
        <Reveal>
          <SectionLabel>Delivery map</SectionLabel>
          <h2>What runs now. What opens next.</h2>
        </Reveal>
      </div>

      <RoadmapSignal />

      <div className={styles.roadmapRows}>
        {ROADMAP.map((item, index) => (
          <Reveal
            className={styles.roadmapRow}
            delay={index * 0.08}
            key={item.state}
          >
            <div className={styles.roadmapState}>
              <span data-state={index}>{item.state}</span>
            </div>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function ClosingSection() {
  return (
    <section className={styles.closingSection}>
      <div className={styles.closingGlow} aria-hidden="true" />
      <Reveal className={styles.closingInner}>
        <ClosingConvergence />
        <SectionLabel>Open research infrastructure</SectionLabel>
        <h2>Trace every layer from interface to result.</h2>
        <p>
          Run the stack locally, inspect the architecture, and help shape an open
          service fabric for quantum workloads.
        </p>
        <div className={styles.heroActions}>
          <a
            className={styles.primaryAction}
            href={REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
          >
            <GitBranch aria-hidden="true" />
            Open the repository
          </a>
          <a className={styles.secondaryAction} href="#overview">
            Back to the top
            <ArrowRight aria-hidden="true" />
          </a>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className={styles.footer}>
      <div>
        <span>DQS</span>
        <span>Distributed Quantum Services</span>
      </div>
      <p>Open-source research software. Claims are scoped to the runnable repository.</p>
      <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
        GitHub
        <ArrowRight aria-hidden="true" />
      </a>
    </footer>
  );
}

export function LandingPage() {
  return (
    <main className={styles.landing} data-dqs-root>
      <LandingHeader />
      <HeroSection />
      <RouteTrace />
      <SystemProblemSection />
      <ScrollOrchestration />
      <CapabilityExplorer />
      <ArchitectureAtlas />
      <ResearchSection />
      <RoadmapSection />
      <ClosingSection />
      <Footer />
    </main>
  );
}
