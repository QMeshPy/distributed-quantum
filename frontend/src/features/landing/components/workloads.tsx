"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Workload } from "../landing-content";
import styles from "../landing.module.css";
import { WorkloadVisual } from "./workload-visuals";


// Workloads as a scroll index (after modal.com's "Container infrastructure that won't box you in"):
// a sticky index beside stacked workload panels; the index and a progress rail follow the scroll.
export function WorkloadIndex({ items }: { items: ReadonlyArray<Workload> }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className={styles.wlScroll}>
      <ol className={styles.wlIndex} style={{ ["--wl-progress" as string]: (active + 1) / items.length }}>
        {items.map((w, i) => (
          <li key={w.title} data-active={i === active}>
            <a
              href={`#wl-${i}`}
              onClick={(e) => {
                e.preventDefault();
                refs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {w.title}
            </a>
          </li>
        ))}
      </ol>
      <div className={styles.wlStack}>
        {items.map((w, i) => (
          <section
            key={w.title}
            id={`wl-${i}`}
            data-index={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={styles.wlCard}
            data-active={i === active}
          >
            <div className={styles.wlCardVisual}>
              <WorkloadVisual kind={w.visual} />
            </div>
            <div className={styles.wlCardBody}>
              <h3>{w.title}</h3>
              <p>{w.body}</p>
              <ul className={styles.checks}>
                {w.points.map((p) => (
                  <li key={p}>
                    <Check aria-hidden="true" />
                    {p}
                  </li>
                ))}
              </ul>
              <p className={styles.wlCardFact}>{w.fact}</p>
              <code className={styles.wlCommand}>{w.api.split("\n")[0]}</code>
              <Link href={w.href} className={styles.pillGhost}>
                {w.action}
              </Link>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
