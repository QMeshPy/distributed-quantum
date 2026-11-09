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
            ? "bg-accent/20 text-accent ring-1 ring-accent/40 "
            : "text-faint hover:bg-surface-muted hover:text-foreground"
        )}
      >
        {isActive && (
          <span className="absolute inset-0 rounded-xl bg-accent/10" />
        )}
        <Icon size={18} strokeWidth={isActive ? 2 : 1.5} className="relative z-10" />
      </span>
      <span
        className={cn(
          "text-xs leading-tight transition-colors",
          isActive ? "font-medium text-accent" : "font-medium text-faint group-hover:text-subtle"
        )}
      >
        {label}
      </span>
    </Link>
  );
}
