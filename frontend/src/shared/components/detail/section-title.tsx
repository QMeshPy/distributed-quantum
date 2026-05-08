import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SectionTitleProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge?: React.ReactNode;
  tooltip?: string;
  accentColor?: string;
}

export function SectionTitle({ icon: Icon, title, badge, tooltip, accentColor = "amber" }: SectionTitleProps) {
  const iconBg: Record<string, string> = {
    amber: "bg-amber-500/10",
    rose: "bg-rose-500/10",
    emerald: "bg-emerald-500/10",
    violet: "bg-violet-500/10",
    sky: "bg-sky-500/10",
  };
  const iconText: Record<string, string> = {
    amber: "text-amber-400",
    rose: "text-rose-400",
    emerald: "text-emerald-400",
    violet: "text-violet-400",
    sky: "text-sky-400",
  };
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", iconBg[accentColor] ?? iconBg.amber)}>
          <Icon className={cn("h-4 w-4", iconText[accentColor] ?? iconText.amber)} />
        </div>
        <span className="text-base font-semibold text-white/85">{title}</span>
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex items-center justify-center rounded-full text-white/25 transition-colors hover:text-white/55 focus-visible:outline-none"
                  aria-label={`Info: ${title}`}
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="max-w-64 text-center text-[11px] leading-relaxed"
              >
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {badge}
    </div>
  );
}
