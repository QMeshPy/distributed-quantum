"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface RailItemProps {
  icon: LucideIcon;
  label: string;
  href: string;
  isActive: boolean;
}

export function RailItem({ icon: Icon, label, href, isActive }: RailItemProps) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1 py-0.5 group"
      aria-current={isActive ? "page" : undefined}
    >
      <span
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200",
          isActive
            ? "bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/40 shadow-[0_0_12px_2px_rgba(99,102,241,0.3)]"
            : "text-white/30 hover:bg-white/8 hover:text-white/70"
        )}
      >
        {isActive && (
          <span className="absolute inset-0 rounded-xl bg-indigo-500/10 animate-glow" />
        )}
        <Icon size={18} strokeWidth={isActive ? 2 : 1.5} className="relative z-10" />
      </span>
      <span
        className={cn(
          "text-[9px] leading-tight transition-colors",
          isActive ? "font-semibold text-indigo-400" : "font-medium text-white/25 group-hover:text-white/50"
        )}
      >
        {label}
      </span>
    </Link>
  );
}
