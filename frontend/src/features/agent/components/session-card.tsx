"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    <Card
      className={cn(
        "cursor-pointer transition-all hover:bg-white/5",
        isActive && "bg-indigo-500/10 border-indigo-500/30"
      )}
      onClick={() => setActiveSession(session.session_id)}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium line-clamp-1">
            {session.title}
          </span>
          <Badge
            variant={statusVariant}
            className="shrink-0 text-xs"
          >
            {session.status}
          </Badge>
        </div>

        <div className="text-xs text-white/40 space-y-1">
          <div>
            {formatDistanceToNow(new Date(session.updated_at), { addSuffix: true })}
          </div>
          <div>
            {session.workflow?.steps.length ?? 0} steps • ${session.cost.actual.toFixed(2)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
