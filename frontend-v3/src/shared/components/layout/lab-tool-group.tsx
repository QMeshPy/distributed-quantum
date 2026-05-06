"use client";

import Link from "next/link";
import { ChevronRight, Plus, Circle } from "lucide-react";
import type { NavToolConfig } from "@/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useRecentRuns } from "./use-recent-runs";

interface LabToolGroupProps {
  tool: NavToolConfig;
  defaultOpen?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "text-emerald-400",
  executing: "text-amber-400",
  failed: "text-red-400",
  queued: "text-white/30",
  compiling: "text-sky-400",
  reserving: "text-violet-400",
};

export function LabToolGroup({ tool, defaultOpen = false }: LabToolGroupProps) {
  const isRunsTool = tool.tool === "runs";
  const { data: recentRuns } = useRecentRuns(isRunsTool);

  return (
    <Collapsible defaultOpen={defaultOpen} className="group/collapsible">
      <div className="flex items-center justify-between px-2 py-1.5">
        <CollapsibleTrigger className="flex flex-1 items-center gap-1.5 text-sm font-medium">
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              "group-data-[state=open]/collapsible:rotate-90",
            )}
          />
          {tool.group}
        </CollapsibleTrigger>
        <Button variant="ghost" size="icon-xs" asChild>
          <Link href={tool.newHref} aria-label={tool.newLabel}>
            <Plus className="size-3.5" />
          </Link>
        </Button>
      </div>
      <CollapsibleContent>
        <div className="px-2 pb-2">
          {isRunsTool && recentRuns && recentRuns.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {recentRuns.map((run) => (
                <Link
                  key={run.jobId}
                  href={`/runs/${run.jobId}`}
                  className="group/item flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-white/5"
                >
                  <Circle
                    size={6}
                    className={cn(
                      "shrink-0 fill-current",
                      STATUS_COLORS[run.status] ?? "text-white/25",
                    )}
                  />
                  <span className="flex-1 truncate text-[11px] text-muted-foreground transition-colors group-hover/item:text-foreground">
                    {run.circuitPreview || run.jobId.slice(0, 8)}
                  </span>
                  <span className="text-[10px] text-white/20">
                    {formatTimeAgo(run.createdAt)}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No recent items
            </p>
          )}
          <Link
            href={tool.historyHref}
            className="mt-1 block px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            View all &rarr;
          </Link>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}
