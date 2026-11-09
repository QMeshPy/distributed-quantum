import { Circle } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, { dot: string; bg: string; text: string; ring: string; label: string }> = {
  completed: {
    dot: "text-success fill-success",
    bg: "bg-success/10",
    text: "text-success",
    ring: "ring-success/20",
    label: "Completed",
  },
  failed: {
    dot: "text-danger fill-danger",
    bg: "bg-danger/10",
    text: "text-danger",
    ring: "ring-danger/20",
    label: "Failed",
  },
  executing: {
    dot: "text-warning fill-warning animate-pulse",
    bg: "bg-warning/10",
    text: "text-warning",
    ring: "ring-warning/20",
    label: "Executing",
  },
  compiling: {
    dot: "text-info fill-info",
    bg: "bg-info/10",
    text: "text-info",
    ring: "ring-info/20",
    label: "Compiling",
  },
  reserving: {
    dot: "text-accent fill-accent",
    bg: "bg-accent/10",
    text: "text-accent",
    ring: "ring-accent/20",
    label: "Reserving",
  },
  queued: {
    dot: "text-subtle fill-subtle",
    bg: "bg-surface-muted",
    text: "text-subtle",
    ring: "ring-border",
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
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
