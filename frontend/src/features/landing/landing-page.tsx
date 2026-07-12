import {
  ArrowRight,
  GitBranch,
  Network,
  ShieldCheck,
  Workflow,
} from "lucide-react";

import { REPOSITORY_URL, USE_CASES } from "./landing-content";
import styles from "./landing-page.module.css";
import {
  ArchitectureAtlas,
  ApplicationSpectrum,
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
    title: "Applied quantum workflows",
    body: "Place application-specific finance, risk, options, molecular, and agent research tools beside an inspectable peer-to-peer circuit fabric.",
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
    title: "Orchestration and portfolio benchmark",
    body: "Circuit orchestration, a QAOA portfolio benchmark, simulated equity and credit risk, options comparisons, and operator diagnostics.",
  },
  {
    state: "In development",
    title: "Discovery and collaboration",
    body: "Experimental molecular screening, AI-assisted proposal workflows, content-addressed circuit sharing, durable artifacts, and richer team controls.",
  },
  {
    state: "Research direction",
    title: "Open node and service network",
    body: "Bring-your-own-node participation, hardware adapters, federated discovery, and torrent-native scientific service packages.",
  },
  {
    state: "Long-term",
    title: "Hydra resilience",
    body: "Multi-coordinator operation, workflow rehydration, topology repair, service regeneration, and self-healing execution policies.",
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
            DQS pairs a peer-to-peer circuit execution fabric with research
            tools for financial modelling, risk, options, and experimental
            molecular workflows.
          </p>

          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="/signin">
              Get started
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

function ApplicationsSection() {
  return (
    <section className={styles.applicationsSection} id="applications">
      <div className={styles.applicationsIntro}>
        <Reveal>
          <SectionLabel>Application domains</SectionLabel>
          <h2>From financial decisions to molecular discovery.</h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p>
            DQS brings its implemented research surfaces into one product story.
            Runnable workflows and experimental directions are labelled separately
            so each claim matches what the repository can support today.
          </p>
        </Reveal>
      </div>

      <ApplicationSpectrum />

      <div className={styles.applicationGrid}>
        {USE_CASES.map((item, index) => {
          const Icon = item.icon;
          return (
            <Reveal
              className={styles.applicationCard}
              delay={index * 0.06}
              key={item.number}
            >
              <a href={item.href}>
                <div className={styles.applicationCardTopline}>
                  <span>{item.number}</span>
                  <Icon aria-hidden="true" />
                  <span data-status={item.status}>{item.status}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <div className={styles.applicationOutcome}>
                  <span aria-hidden="true" />
                  {item.outcome}
                </div>
                <div className={styles.applicationCardCta}>
                  Get started
                  <ArrowRight aria-hidden="true" />
                </div>
              </a>
            </Reveal>
          );
        })}
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
        <SectionLabel>Start a quantum workflow</SectionLabel>
        <h2>Move from a real problem to an inspectable result.</h2>
        <p>
          Begin with financial modelling, risk, options, experimental molecular
          workflows, or distributed circuits—then inspect the inputs, diagnostics,
          and execution state the system records.
        </p>
        <div className={styles.heroActions}>
          <a className={styles.primaryAction} href="/signin">
            Get started
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
      <ApplicationsSection />
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
