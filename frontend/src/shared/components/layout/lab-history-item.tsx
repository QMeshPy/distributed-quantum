import Link from "next/link";
import { cn } from "@/lib/utils";

const STATUS_DOT_COLOR: Record<LabHistoryItemProps["status"], string> = {
  completed: "bg-green-500",
  running: "bg-blue-500",
  failed: "bg-red-500",
  pending: "bg-muted-foreground/50",
};

interface LabHistoryItemProps {
  label: string;
  status: "completed" | "running" | "failed" | "pending";
  href: string;
  time: string;
}

export function LabHistoryItem({
  label,
  status,
  href,
  time,
}: LabHistoryItemProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
    >
      <span
        className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT_COLOR[status])}
        aria-label={status}
      />
      <span className="flex-1 truncate">{label}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{time}</span>
    </Link>
  );
}
