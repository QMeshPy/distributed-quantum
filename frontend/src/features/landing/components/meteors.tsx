"use client";

import { cn } from "@/lib/utils";

export function Meteors({
  count = 12,
  className,
}: {
  count?: number;
  className?: string;
}) {
  const meteors = Array.from({ length: count }, (_, i) => i);

  return (
    <div className={cn("absolute inset-0 overflow-hidden pointer-events-none", className)}>
      {meteors.map((i) => {
        const left = `${Math.random() * 100}%`;
        const delay = `${Math.random() * 4}s`;
        const duration = `${Math.random() * 2 + 2}s`;
        return (
          <span
            key={i}
            className="absolute top-0 h-[1px] w-[80px] rotate-[215deg] animate-[meteor_3s_linear_infinite] rounded-full bg-gradient-to-r from-primary/60 to-transparent opacity-0"
            style={{
              left,
              animationDelay: delay,
              animationDuration: duration,
            }}
          />
        );
      })}
    </div>
  );
}
