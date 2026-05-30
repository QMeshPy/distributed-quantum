"use client";

import { useRef } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export function MovingBorder({
  children,
  className,
  containerClassName,
  duration = 3000,
}: {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  duration?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden rounded-xl p-[1px]", containerClassName)}
    >
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0%, rgba(99,102,241,0.5) 10%, transparent 20%, transparent 50%, rgba(34,211,238,0.5) 60%, transparent 70%)",
        }}
        animate={{ rotate: 360 }}
        transition={{
          duration: duration / 1000,
          repeat: Infinity,
          ease: "linear",
        }}
      />
      <div
        className={cn(
          "relative rounded-[11px] bg-[#0d0f14]",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
