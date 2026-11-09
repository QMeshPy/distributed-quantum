import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/arc/button/button";
import { Tooltip } from "@/components/arc/tooltip/tooltip";

interface SectionTitleProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge?: React.ReactNode;
  tooltip?: string;
  accentColor?: string;
}

export function SectionTitle({
  icon: Icon,
  title,
  badge,
  tooltip,
  accentColor = "amber",
}: SectionTitleProps) {
  const iconBg: Record<string, string> = {
    amber: "bg-warning/10",
    rose: "bg-danger/10",
    emerald: "bg-success/10",
    violet: "bg-accent/10",
    sky: "bg-info/10",
  };
  const iconText: Record<string, string> = {
    amber: "text-warning",
    rose: "text-danger",
    emerald: "text-success",
    violet: "text-accent",
    sky: "text-info",
  };
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            iconBg[accentColor] ?? iconBg.amber,
          )}
        >
          <Icon
            className={cn("h-4 w-4", iconText[accentColor] ?? iconText.amber)}
          />
        </div>
        <span className="text-base font-medium text-foreground">{title}</span>
        {tooltip && (
          <Tooltip side="top" content={tooltip}>
            <Button type="button" size="sm" variant="ghost" aria-label={`Info: ${title}`}>
            <Info className="h-3.5 w-3.5" />
          </Button>
          </Tooltip>
        )}
      </div>
      {badge}
    </div>
  );
}
