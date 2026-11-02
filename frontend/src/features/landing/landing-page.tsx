import Link from "next/link";
import { ArrowRight, ArrowUpRight, Globe, Plus } from "lucide-react";
import localFont from "next/font/local";

import { ArchStack } from "./components/arch-stack";
import { InfrastructureStrip } from "./components/infrastructure-strip";
import { Identicon, MeshMark } from "./components/mesh-mark";
import { NavMenu } from "./components/nav-menu";
import { LinkedInIcon, XIcon } from "./components/social-icons";
import { GlyphBand, HeroMesh, InkWordmark, ResultsStory, Reveal, RollingNumber } from "./components/motion-bits";
import { SmoothScroll } from "./components/smooth-scroll";
import { ReceiptScroll } from "./components/receipt-scroll";
import { RepoLab, StartLab } from "./components/build-variants";
import { WorkloadIndex } from "./components/workloads";
import {
  ARCHITECTURE,
  CLOSING,
  CONSOLE_HREF,
  DEMO_URL,
  START,
  FAQ,
  FOOTER,
  GLYPHS,
  HERO,
  NAV,
  REPO,
  RECEIPT,
  REPOSITORY_URL,
  RESEARCH_URL,
  RESULTS,
  TEAM,
  WORKLOADS,
} from "./landing-content";
import styles from "./landing.module.css";

const display = localFont({
  src: [
    { path: "../../assets/fonts/newsreader/Newsreader[opsz,wght].woff2", weight: "300 400", style: "normal" },
    { path: "../../assets/fonts/newsreader/Newsreader-Italic[opsz,wght].woff2", weight: "300 400", style: "italic" },
  ],
  display: "swap",
  adjustFontFallback: "Times New Roman",
  variable: "--landing-display",
});
const text = localFont({
  src: "../../assets/fonts/inter/Inter[opsz,wght].woff2",
  weight: "300 600",
  display: "swap",
  variable: "--landing-text",
});

function External({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  );
}

export function LandingPage() {
  return (
    <div id="top" className={`${styles.page} ${display.variable} ${text.variable}`}>
      <SmoothScroll />
      <div className={styles.rails} aria-hidden="true" />

      <header className={styles.nav}>
        <a href="#top" className={styles.brand} aria-label="QMesh, back to top">
          <MeshMark className={styles.brandMark} />
          <span>QMesh</span>
        </a>
        <nav className={styles.navLinks} aria-label="Sections">
          {NAV.links.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className={styles.navActions}>
          <External href={REPOSITORY_URL} className={styles.pillText}>
            {NAV.secondary}
          </External>
          <Link href={CONSOLE_HREF} className={styles.pill}>
            {NAV.primary}
          </Link>
          <NavMenu nav={NAV} repositoryHref={REPOSITORY_URL} consoleHref={CONSOLE_HREF} />
        </div>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroIntro}>
            <h1 id="hero-title" className={styles.h1}>
              {HERO.title[0]}
              <br />
              <em>{HERO.title[1]}</em>
            </h1>
            <p className={styles.heroLead}>
              {HERO.body} <span>{HERO.muted}</span>
            </p>
            <div className={styles.actions}>
              <External href={DEMO_URL} className={styles.pill}>
                {HERO.primary} <ArrowRight aria-hidden="true" />
              </External>
              <Link href={CONSOLE_HREF} className={styles.pillGhost}>
                {HERO.secondary}
              </Link>
            </div>
          </div>
          <HeroMesh label={HERO.scene} caption={HERO.sceneCaption} />
          <a href="#architecture" className={styles.ribbon}>
            <span className={styles.ribbonDot} aria-hidden="true" />
            {HERO.ribbon} <ArrowRight aria-hidden="true" />
          </a>
        </section>

        <GlyphBand label={GLYPHS.label} />

        <InfrastructureStrip />

        <section id="architecture" className={styles.architecture} aria-labelledby="architecture-title">
          <ArchStack title={ARCHITECTURE.title} body={ARCHITECTURE.body} layers={ARCHITECTURE.layers} />
        </section>

        <section id="workloads" className={styles.section} aria-labelledby="workloads-title">
          <Reveal>
            <h2 id="workloads-title" className={styles.h2}>
              {WORKLOADS.title}
            </h2>
          </Reveal>
          <WorkloadIndex items={WORKLOADS.items} />
        </section>

        <section id="repository" className={styles.section} aria-labelledby="products-title">
          <div className={styles.sectionHead}>
            <h2 id="products-title" className={styles.h2}>
              {REPO.title}
            </h2>
            <p className={styles.lead}>{REPO.body}</p>
          </div>
          <RepoLab repo={REPO} />
        </section>

        <section id="results" className={styles.section} aria-labelledby="results-title">
          <div className={styles.sectionHead}>
            <h2 id="results-title" className={styles.h2}>
              {RESULTS.title}
            </h2>
            <External href={DEMO_URL} className={styles.pillGhost}>
              {RESULTS.action} <ArrowRight aria-hidden="true" />
            </External>
          </div>
          <ResultsStory story={RESULTS.story} paperHref={RESEARCH_URL} />
          <dl className={styles.stats}>
            {RESULTS.stats.map((stat) => (
              <div key={stat.title} className={styles.stat}>
                <dt className={styles.statValue}>
                  <RollingNumber value={stat.value} suffix={stat.suffix} />
                </dt>
                <dd>
                  <span className={styles.statTitle}>{stat.title}</span>
                  {stat.body}
                </dd>
              </div>
            ))}
          </dl>
          <p className={styles.footnote}>{RESULTS.footnote}</p>
        </section>

        <section id="receipt" className={`${styles.section} ${styles.receiptSection}`} aria-labelledby="receipt-title">
          <ReceiptScroll receipt={RECEIPT} />
        </section>

        <section id="developers" className={styles.section} aria-labelledby="developers-title">
          <div className={styles.sectionHead}>
            <h2 id="developers-title" className={styles.h2}>
              {START.title}
            </h2>
            <p className={styles.lead}>{START.body}</p>
          </div>
          <StartLab start={START} />
        </section>

        <section id="team" className={styles.section} aria-labelledby="team-title">
          <div className={styles.sectionHead}>
            <h2 id="team-title" className={styles.h2}>
              {TEAM.title}
            </h2>
            <p className={styles.lead}>{TEAM.body}</p>
          </div>
          <ul className={styles.team}>
            {TEAM.members.map((member) => (
              <li key={member.name} className={styles.member}>
                <span className={styles.memberPhoto}>
                  {member.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small local profile photos
                    <img src={member.photo} alt="" width={56} height={56} />
                  ) : (
                    <Identicon seed={member.name} />
                  )}
                </span>
                <span className={styles.memberName}>{member.name}</span>
                <span className={styles.memberRole}>{member.role}</span>
                {member.github ? (
                  <External href={`https://github.com/${member.github}`} className={styles.memberLink}>
                    @{member.github} <ArrowUpRight aria-hidden="true" />
                  </External>
                ) : null}
                <span className={styles.memberSocial}>
                  {(
                    [
                      ["X", member.x, XIcon, `${member.name} on X`],
                      ["LinkedIn", member.linkedin, LinkedInIcon, `${member.name} on LinkedIn`],
                      ["Website", member.website, Globe, `${member.name}'s website`],
                    ] as const
                  ).map(([label, href, Icon, name]) =>
                    href ? (
                      <External key={label} href={href} className={styles.memberSocialLink}>
                        <Icon aria-hidden="true" />
                        <span className={styles.srOnly}>{name}</span>
                      </External>
                    ) : (
                      <span key={label} className={styles.memberSocialEmpty} title={`${label} link coming soon`}>
                        <Icon aria-hidden="true" />
                      </span>
                    ),
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section id="faq" className={`${styles.section} ${styles.faq}`} aria-labelledby="faq-title">
          <h2 id="faq-title" className={styles.h2}>
            {FAQ.title}
          </h2>
          <div className={styles.faqList}>
            {FAQ.items.map((item, index) => (
              <details key={item.question} className={styles.faqItem} open={index === 0}>
                <summary>
                  {item.question}
                  <Plus aria-hidden="true" className={styles.faqIcon} />
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

      </main>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <div className={styles.footerCta}>
            <h2 id="closing-title" className={styles.footerHeading}>
              {CLOSING.title}
            </h2>
            <Link href={CONSOLE_HREF} className={styles.pill}>
              {CLOSING.primary} <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          <div className={styles.inkFrame}>
            <InkWordmark word={FOOTER.wordmark} />
          </div>
        </div>
        <div className={styles.footerBottom}>
          <div className={styles.footerNote}>
            <span className={styles.brand}>
              <MeshMark className={styles.brandMark} />
              <span>QMesh</span>
            </span>
            <p>{FOOTER.blurb}</p>
            <p className={styles.footerScope}>{FOOTER.scope}</p>
          </div>
          {FOOTER.columns.map((column) => (
            <div key={column.title} className={styles.footerColumn}>
              <h3>{column.title}</h3>
              <ul>
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith("http") ? (
                      <External href={link.href}>{link.label}</External>
                    ) : (
                      <Link href={link.href}>{link.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className={styles.footerMeta}>{FOOTER.copy}</p>
      </footer>
    </div>
  );
}
