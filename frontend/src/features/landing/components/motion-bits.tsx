"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

import styles from "../landing.module.css";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Fades a block up out of a slight blur as it enters the viewport. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  // Same markup on server and client; reduced motion is handled in CSS.
  return (
    <motion.div
      className={`${styles.reveal} ${className ?? ""}`}
      initial={{ opacity: 0, y: 28, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 1.1, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

const DIGITS = "0123456789";

/** A number whose digits roll into place once it scrolls into view. */
export function RollingNumber({ value, suffix }: { value: string; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <span ref={ref} className={styles.rolling} aria-label={`${value}${suffix}`}>
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char);
        if (digit < 0) {
          return (
            <span key={index} aria-hidden="true">
              {char}
            </span>
          );
        }
        return (
          <span key={index} className={styles.rollingWindow} aria-hidden="true">
            {/* The final digit sizes the window, so narrow digits sit tight. */}
            <span className={styles.rollingSizer}>{char}</span>
            <span
              className={styles.rollingColumn}
              style={
                {
                  "--digit": digit,
                  transform: shown ? `translateY(-${digit * 10}%)` : "translateY(0)",
                  transitionDelay: `${index * 90}ms`,
                } as React.CSSProperties
              }
            >
              {DIGITS.split("").map((option) => (
                <span key={option}>{option}</span>
              ))}
            </span>
          </span>
        );
      })}
      <span aria-hidden="true">{suffix}</span>
    </span>
  );
}

/** A statement whose words light up as it moves through the viewport. */
// The hero's isometric mesh and the glyph band load on the client only.
const IsoMesh = dynamic(() => import("./iso-mesh").then((m) => m.IsoMesh), {
  ssr: false,
  loading: () => <div className={styles.isoStage} aria-hidden="true" />,
});

export function HeroMesh({ label, caption }: { label: string; caption: string }) {
  return <IsoMesh label={label} caption={caption} />;
}

const FlowBand = dynamic(() => import("./flow-band").then((m) => m.FlowBand), {
  ssr: false,
  loading: () => <div className={styles.glyphBand} aria-hidden="true" />,
});

export function GlyphBand({ label }: { label: string }) {
  return <FlowBand label={label} />;
}

// The results story is a canvas scroll scene: client only, with a placeholder that keeps its height.
const ResultsStoryScene = dynamic(() => import("./results-story").then((m) => m.ResultsStory), {
  ssr: false,
  loading: () => <div className={styles.storyTrack} aria-hidden="true" />,
});

export function ResultsStory(props: React.ComponentProps<typeof ResultsStoryScene>) {
  return <ResultsStoryScene {...props} />;
}

// The footer's ink wordmark is a canvas: client only, with a placeholder that keeps its height.
const InkWordmarkScene = dynamic(() => import("./ink-wordmark").then((m) => m.InkWordmark), {
  ssr: false,
  loading: () => <div className={styles.inkCanvas} aria-hidden="true" />,
});

export function InkWordmark(props: React.ComponentProps<typeof InkWordmarkScene>) {
  return <InkWordmarkScene {...props} />;
}
