"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Plus, Circle } from "lucide-react";
import type { NavToolConfig } from "@/constants";
import { ROUTES } from "@/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useRecentRuns } from "./use-recent-runs";
import { useOptionsList } from "@/features/options/hooks/use-options-list";
import { useRiskList } from "@/features/risk/hooks/use-risk-list";
import { useFinanceList } from "@/features/finance/hooks/use-finance-list";
import { usePharmaJobs } from "@/features/pharma/hooks/use-pharma-jobs";
import type { ChatSession } from "@/features/agentkit/hooks/use-chat-sessions";

interface LabToolGroupProps {
  tool: NavToolConfig;
  defaultOpen?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "text-emerald-400",
  executing: "text-amber-400",
  running: "text-sky-400",
  failed: "text-red-400",
  queued: "text-white/30",
  cancelled: "text-white/25",
  compiling: "text-sky-400",
  reserving: "text-violet-400",
};

type RecentItem = { jobId: string; label: string; status: string; createdAt: string; href: string };

function useRecentItems(tool: NavToolConfig): RecentItem[] {
  const { data: runs } = useRecentRuns(tool.tool === "runs");
  const { data: options } = useOptionsList();
  const { data: risk } = useRiskList();
  const { data: finance } = useFinanceList();
  const { data: pharmaJobs } = usePharmaJobs();
  const [chatSessions, setChatSessions] = React.useState<ChatSession[]>([]);
  const fetchSessions = React.useCallback(() => {
    if (tool.tool !== "chat") return;
    fetch("/api/agentkit/chat-sessions")
      .then((r) => r.ok ? r.json() : [])
      .then((data: unknown[]) => {
        if (!Array.isArray(data)) return;
        setChatSessions(
          data.map((d: unknown) => {
            const raw = d as { session_id: string; title: string; agent_id: string; created_at: string; updated_at: string };
            return {
              id: raw.session_id,
              title: raw.title,
              agentId: raw.agent_id,
              messages: [],
              createdAt: new Date(raw.created_at).getTime(),
              updatedAt: new Date(raw.updated_at).getTime(),
            } satisfies ChatSession;
          }).sort((a, b) => b.updatedAt - a.updatedAt)
        );
      })
      .catch(() => {});
  }, [tool.tool]);

  React.useEffect(() => {
    fetchSessions();
    const id = setInterval(fetchSessions, 5000);
    return () => clearInterval(id);
  }, [fetchSessions]);

  if (tool.tool === "runs") {
    return (runs ?? []).slice(0, 5).map((r) => ({
      jobId: r.jobId,
      label: r.circuitPreview || r.jobId.slice(0, 12),
      status: r.status,
      createdAt: r.createdAt,
      href: `/runs/${r.jobId}`,
    }));
  }
  if (tool.tool === "options") {
    return (options ?? [])
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map((j) => ({
        jobId: j.jobId,
        label: j.optionType || j.jobId.slice(0, 12),
        status: j.status,
        createdAt: j.createdAt,
        href: ROUTES.optionsDetail(j.jobId),
      }));
  }
  if (tool.tool === "risk") {
    return (risk ?? [])
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map((j) => ({
        jobId: j.jobId,
        label: j.riskModel || j.jobId.slice(0, 12),
        status: j.status,
        createdAt: j.createdAt,
        href: ROUTES.riskDetail(j.jobId),
      }));
  }
  if (tool.tool === "finance") {
    return (finance ?? [])
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map((j) => ({
        jobId: j.jobId,
        label: j.filename || j.problemType || j.jobId.slice(0, 12),
        status: j.status,
        createdAt: j.createdAt,
        href: ROUTES.financeDetail(j.jobId),
      }));
  }
  if (tool.tool === "pharma") {
    return (pharmaJobs ?? [])
      .slice()
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
      .slice(0, 5)
      .map((j) => ({
        jobId: j.job_id,
        label: j.target_pdb_id || j.job_id.slice(0, 12),
        status: j.status,
        createdAt: j.submitted_at,
        href: ROUTES.pharmaJob(j.job_id),
      }));
  }
  if (tool.tool === "chat") {
    return chatSessions.slice(0, 5).map((s) => ({
      jobId: s.id,
      label: s.title,
      status: "completed",
      createdAt: new Date(s.createdAt).toISOString(),
      href: `/agents/chat?sessionId=${s.id}`,
    }));
  }
  return [];
}

export function LabToolGroup({ tool, defaultOpen = false }: LabToolGroupProps) {
  const items = useRecentItems(tool);
  const pathname = usePathname();

  // Plain nav link — no history or new-item concept
  if (!tool.newLabel) {
    const isActive = pathname === tool.href;
    return (
      <Link
        href={tool.href}
        className={cn(
          "flex h-8 items-center rounded-lg px-3 text-sm transition-all duration-150 mx-2",
          isActive
            ? "bg-indigo-500/15 font-medium text-indigo-300 ring-1 ring-indigo-500/25"
            : "text-white/40 hover:bg-white/6 hover:text-white/80",
        )}
      >
        {tool.group}
      </Link>
    );
  }

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
{tool.newLabel && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              const href = tool.newHref.includes("?")
                ? `${tool.newHref}&new=${Date.now()}`
                : `${tool.newHref}?new=${Date.now()}`;
              window.location.href = href;
            }}
            aria-label={tool.newLabel}
          >
            <Plus className="size-3.5" />
          </Button>
        )}
      </div>
      <CollapsibleContent>
        <div className="px-2 pb-2">
          {items.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {items.map((item) => (
                <Link
                  key={item.jobId}
                  href={item.href}
                  className="group/item flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-white/5"
                >
                  <Circle
                    size={6}
                    className={cn(
                      "shrink-0 fill-current",
                      STATUS_COLORS[item.status.toLowerCase()] ?? "text-white/25",
                    )}
                  />
                  <span className="flex-1 truncate text-[11px] text-muted-foreground transition-colors group-hover/item:text-foreground">
                    {item.label}
                  </span>
                  <span className="text-[10px] text-white/20">
                    {formatTimeAgo(item.createdAt)}
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
