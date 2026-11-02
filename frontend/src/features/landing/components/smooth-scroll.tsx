"use client";

import Lenis from "lenis";
import { useEffect } from "react";

/**
 * Inertial page scroll for the landing (Lenis). It drives the native window
 * scroll, so motion's useScroll, sticky headings and anchors keep working.
 * Skipped entirely for reduced motion.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({
      lerp: 0.09,
      wheelMultiplier: 0.95,
      // Anchor jumps (nav links, the logo back to top) glide for a fixed time with an
      // ease-in-out, so a long trip does not flash through the pinned sections.
      anchors: {
        offset: -72,
        duration: 1.4,
        easing: (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),
      },
      autoRaf: true,
    });
    // Lenis owns easing; the CSS smooth-scroll fallback would double it.
    document.documentElement.style.scrollBehavior = "auto";
    return () => {
      lenis.destroy();
      document.documentElement.style.scrollBehavior = "";
    };
  }, []);
  return null;
}
