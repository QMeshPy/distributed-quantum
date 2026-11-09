"use client";

import { Panel, PanelContent } from "@/shared/components/panel/panel";
import { Badge } from "@/components/arc/badge/badge";
import { legacyBadge } from "@/lib/legacy-badge";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useAgentStore } from "../stores/agent-store";
import type { AgentSession } from "../types";

interface SessionCardProps {
  session: AgentSession;
}

export function SessionCard({ session }: SessionCardProps) {
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const setActiveSession = useAgentStore((s) => s.setActiveSession);
  const isActive = activeSessionId === session.session_id;

  const statusVariant = {
    active: "default",
    paused: "outline",
    completed: "secondary",
    failed: "destructive",
  }[session.status] as "default" | "outline" | "secondary" | "destructive";

  return (
    <Panel
      className={cn(
        "cursor-pointer transition-all hover:bg-surface-muted",
        isActive && "bg-accent/10 border-accent/30"
      )}
      onClick={() => setActiveSession(session.session_id)}
    >
      <PanelContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium line-clamp-1">
            {session.title}
          </span>
          <Badge
            {...legacyBadge(statusVariant)}
            className="shrink-0 text-xs"
          >
            {session.status}
          </Badge>
        </div>

        <div className="text-xs text-subtle space-y-1">
          <div>
            {formatDistanceToNow(new Date(session.updated_at), { addSuffix: true })}
          </div>
          <div>
            {session.workflow?.steps.length ?? 0} steps • ${session.cost.actual.toFixed(2)}
          </div>
        </div>
      </PanelContent>
    </Panel>
  );
}
