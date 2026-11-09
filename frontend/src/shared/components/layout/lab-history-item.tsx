import Link from "next/link";
import { cn } from "@/lib/utils";

const STATUS_DOT_COLOR: Record<LabHistoryItemProps["status"], string> = {
  completed: "bg-success",
  running: "bg-accent",
  failed: "bg-danger",
  pending: "bg-subtle/50",
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
      <span className="shrink-0 text-xs text-subtle">{time}</span>
    </Link>
  );
}
