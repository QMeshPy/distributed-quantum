"use client";

import { Pause, Play } from "lucide-react";
import { useState } from "react";

import { BUILT_ON } from "../landing-content";
import styles from "../landing.module.css";

export function InfrastructureStrip() {
  const [paused, setPaused] = useState(false);

  return (
    <section className={styles.builtOn} aria-labelledby="infrastructure-title" data-paused={paused}>
      <div className={styles.builtOnHead}>
        <h2 id="infrastructure-title" className={styles.logoLabel}>{BUILT_ON.short}</h2>
        <button
          type="button"
          className={styles.logoPause}
          aria-label={paused ? BUILT_ON.resume : BUILT_ON.pause}
          onClick={() => setPaused(value => !value)}
        >
          {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          {paused ? BUILT_ON.resume : BUILT_ON.pause}
        </button>
      </div>
      <div className={styles.logoRows}>
        {BUILT_ON.rows.map((row, index) => (
          <div key={BUILT_ON.rowLabels[index]} className={styles.logoRow} role="group" aria-label={BUILT_ON.rowLabels[index]} tabIndex={0}>
            <div className={styles.logoTrack}>
              {[false, true].map(duplicate => (
                <ul key={String(duplicate)} className={styles.logoGroup} aria-hidden={duplicate || undefined}>
                  {row.map(item => (
                    <li key={item.name} className={styles.logoCell}>
                      <span className={styles.logoName}>{item.name}</span>
                      <span className={styles.logoRole}>{item.role}</span>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
