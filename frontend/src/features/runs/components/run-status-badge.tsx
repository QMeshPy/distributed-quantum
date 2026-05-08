import { Circle } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, { dot: string; bg: string; text: string; ring: string; label: string }> = {
  completed: {
    dot: "text-emerald-400 fill-emerald-400",
    bg: "bg-emerald-400/10",
    text: "text-emerald-300",
    ring: "ring-emerald-400/20",
    label: "Completed",
  },
  failed: {
    dot: "text-red-400 fill-red-400",
    bg: "bg-red-400/10",
    text: "text-red-300",
    ring: "ring-red-400/20",
    label: "Failed",
  },
  executing: {
    dot: "text-amber-400 fill-amber-400 animate-pulse",
    bg: "bg-amber-400/10",
    text: "text-amber-300",
    ring: "ring-amber-400/20",
    label: "Executing",
  },
  compiling: {
    dot: "text-sky-400 fill-sky-400",
    bg: "bg-sky-400/10",
    text: "text-sky-300",
    ring: "ring-sky-400/20",
    label: "Compiling",
  },
  reserving: {
    dot: "text-violet-400 fill-violet-400",
    bg: "bg-violet-400/10",
    text: "text-violet-300",
    ring: "ring-violet-400/20",
    label: "Reserving",
  },
  queued: {
    dot: "text-white/40 fill-white/40",
    bg: "bg-white/5",
    text: "text-white/50",
    ring: "ring-white/10",
    label: "Queued",
  },
};

const DEFAULT_STYLE = STATUS_STYLES.queued!;

export function RunStatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  const style = STATUS_STYLES[key] ?? DEFAULT_STYLE;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1",
        style.bg,
        style.text,
        style.ring,
      )}
    >
      <Circle size={6} className={style.dot} />
      {style.label}
    </span>
  );
}
