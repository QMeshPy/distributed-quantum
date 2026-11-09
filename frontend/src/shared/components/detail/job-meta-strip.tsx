import { Badge } from "@/components/arc/badge/badge";
import { legacyBadge } from "@/lib/legacy-badge";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

function statusVariant(status: string): BadgeVariant {
  if (status === "completed") return "default";
  if (status === "failed") return "destructive";
  if (status === "processing" || status === "queued") return "secondary";
  return "outline";
}

interface ExtraBadge {
  label: string;
  className?: string;
}

interface JobMetaStripProps {
  jobId: string;
  status: string;
  createdAt: string;
  extraBadges?: ExtraBadge[];
  /** Rendered at the far right, after the date */
  rightContent?: React.ReactNode;
}

export function JobMetaStrip({ jobId, status, createdAt, extraBadges, rightContent }: JobMetaStripProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-xs text-faint">{jobId}</span>
      <Badge {...legacyBadge(statusVariant(status))}>{status}</Badge>
      {extraBadges?.map((b) => (
        <Badge key={b.label} outline className={b.className}>
          {b.label}
        </Badge>
      ))}
      <span className="ml-auto text-xs text-faint">{new Date(createdAt).toLocaleString()}</span>
      {rightContent}
    </div>
  );
}
