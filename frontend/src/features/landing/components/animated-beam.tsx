"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export function AnimatedBeam({ className }: { className?: string }) {
  return (
    <div className={cn("absolute inset-0 overflow-hidden pointer-events-none", className)}>
      <motion.div
        className="absolute h-[1px] w-[200px] bg-gradient-to-r from-transparent via-primary/60 to-transparent"
        initial={{ x: "-200px", y: "30%" }}
        animate={{ x: "calc(100vw + 200px)" }}
        transition={{
          duration: 4,
          repeat: Infinity,
          repeatDelay: 2,
          ease: "linear",
        }}
      />
      <motion.div
        className="absolute h-[1px] w-[300px] bg-gradient-to-r from-transparent via-[var(--glow-cyan-1)]/40 to-transparent"
        initial={{ x: "-300px", y: "60%" }}
        animate={{ x: "calc(100vw + 300px)" }}
        transition={{
          duration: 5,
          repeat: Infinity,
          repeatDelay: 3,
          ease: "linear",
          delay: 1.5,
        }}
      />
      <motion.div
        className="absolute h-[1px] w-[150px] bg-gradient-to-r from-transparent via-[var(--glow-violet-1)]/30 to-transparent"
        initial={{ x: "-150px", y: "80%" }}
        animate={{ x: "calc(100vw + 150px)" }}
        transition={{
          duration: 3.5,
          repeat: Infinity,
          repeatDelay: 4,
          ease: "linear",
          delay: 3,
        }}
      />
    </div>
  );
}
