"use client";

import { useMotionValueEvent, useScroll } from "motion/react";
import { useEffect, useRef, useState } from "react";

import type { RECEIPT } from "../landing-content";
import styles from "../landing.module.css";

type Receipt = typeof RECEIPT;

const DIGITS = "0123456789";

/** Odometer digits: each column slides to its digit, like contentarchitecture.dev's counter. */
function Odometer({ value }: { value: number }) {
  const text = String(value).padStart(2, "0");
  return (
    <span className={styles.odometer} aria-label={String(value)}>
      {[...text].map((d, i) => (
        <span key={i} className={styles.odometerWindow} aria-hidden="true">
          <span className={styles.odometerColumn} style={{ transform: `translateY(-${Number(d) * 10}%)` }}>
            {[...DIGITS].map((n) => (
              <span key={n}>{n}</span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * A run's receipt prints line by line as the section scrolls; the newest line is
 * inverted and the counter rolls to the number of events recorded so far.
 */
export function ReceiptScroll({ receipt }: { receipt: Receipt }) {
  const track = useRef<HTMLDivElement>(null);
  const total = receipt.groups.reduce((n, g) => n + g.lines.length, 0);
  const [printed, setPrinted] = useState(0);
  // Below 1080px the receipt sits in the page flow, so it prints as it crosses the viewport.
  const [inFlow, setInFlow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1080px)");
    const sync = () => setInFlow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const { scrollYProgress } = useScroll({
    target: track,
    offset: inFlow ? ["start 0.7", "end 0.9"] : ["start start", "end end"],
  });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    // Print across the first 85% of the track, then hold the finished receipt.
    const next = Math.min(total, Math.floor((v / 0.85) * (total + 0.999)));
    setPrinted((prev) => (prev === next ? prev : next));
  });

  // Where each group's lines start in the overall print order.
  const starts = receipt.groups.map((_, g) => receipt.groups.slice(0, g).reduce((n, x) => n + x.lines.length, 0));
  return (
    <div ref={track} className={styles.receiptTrack}>
      <div className={styles.receiptStage}>
        <div className={styles.receiptIntro}>
          <h2 id="receipt-title" className={styles.h2}>
            {receipt.title[0]} <em>{receipt.title[1]}</em>
          </h2>
          <p className={styles.lead}>{receipt.body}</p>
          <div className={styles.receiptCounter}>
            <Odometer value={printed} />
            <span className={styles.receiptCounterLabel}>
              {receipt.counterLabel.toUpperCase()}
              <span className={styles.receiptChip}>{receipt.chip.toUpperCase()}</span>
            </span>
          </div>
        </div>

        <div className={styles.receipt} aria-live="polite">
          <div className={styles.receiptHead}>
            <span>{receipt.head[0].toUpperCase()}</span>
            <span>{receipt.head[1].toUpperCase()}</span>
          </div>
          {receipt.groups.map((group, g) => (
            <div key={group.name} className={styles.receiptGroup} data-shown={starts[g] < printed}>
              <div className={styles.receiptGroupHead} data-shown={starts[g] < printed}>
                <span>{group.name.toUpperCase()}</span>
                <span>{group.tag.toUpperCase()}</span>
              </div>
              {group.lines.map(([label, value], k) => {
                const i = starts[g] + k;
                const state = i < printed - 1 ? "done" : i === printed - 1 ? "new" : "pending";
                return (
                  <div key={label} className={styles.receiptLine} data-state={state}>
                    <span className={styles.receiptLabel}>{label.toUpperCase()}</span>
                    <span className={styles.receiptLeader} aria-hidden="true" />
                    <span>{value.toUpperCase()}</span>
                  </div>
                );
              })}
            </div>
          ))}
          <div className={styles.receiptProgress} aria-hidden="true">
            <span style={{ transform: `scaleX(${printed / total})` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
