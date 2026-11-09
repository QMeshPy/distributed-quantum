"use client";
import { useRouter } from "next/navigation";
import { Zap, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Accent = "emerald" | "rose" | "amber" | "violet";

interface QuantumDetailsButtonProps {
  href: string;
  accent?: Accent;
}

const ACCENT_CLASSES: Record<Accent, string> = {
  emerald:
    "border-emerald-500/25 bg-emerald-500/8 text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/15 hover:text-emerald-300",
  rose:
    "border-rose-500/25 bg-rose-500/8 text-rose-400 hover:border-rose-500/50 hover:bg-rose-500/15 hover:text-rose-300",
  amber:
    "border-amber-500/25 bg-amber-500/8 text-amber-400 hover:border-amber-500/50 hover:bg-amber-500/15 hover:text-amber-300",
  violet:
    "border-violet-500/25 bg-violet-500/8 text-violet-400 hover:border-violet-500/50 hover:bg-violet-500/15 hover:text-violet-300",
};

const SHIMMER_CLASSES: Record<Accent, string> = {
  emerald: "via-emerald-400/12",
  rose: "via-rose-400/12",
  amber: "via-amber-400/12",
  violet: "via-violet-400/12",
};

export function QuantumDetailsButton({
  href,
  accent = "emerald",
}: QuantumDetailsButtonProps) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(href)}
      className={cn(
        "group relative flex cursor-pointer items-center gap-1.5 overflow-hidden rounded-md",
        "border px-3 py-1.5",
        "text-[12px] font-medium transition-all duration-200",
        ACCENT_CLASSES[accent],
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent to-transparent transition-transform duration-700 group-hover:translate-x-full",
          SHIMMER_CLASSES[accent],
        )}
      />
      <Zap className="h-3 w-3 shrink-0 animate-pulse" />
      <span>Quantum Details</span>
      <ArrowRight className="h-3 w-3 shrink-0 opacity-60 transition-transform duration-150 group-hover:translate-x-0.5" />
    </button>
  );
}
