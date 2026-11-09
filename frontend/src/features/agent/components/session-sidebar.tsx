"use client";

import { Button } from "@/components/arc/button/button";
import { ScrollArea } from "@/components/arc/scroll-area/scroll-area";
import { Plus } from "lucide-react";
import { useAgentSessions } from "../hooks/use-agent-sessions";
import { useCreateSession } from "../hooks/use-create-session";
import { useAgentStore } from "../stores/agent-store";
import { SessionCard } from "./session-card";
import { BudgetIndicator } from "./budget-indicator";

export function SessionSidebar() {
  const { data: sessions, isLoading } = useAgentSessions();
  const createSession = useCreateSession();
  const setActiveSession = useAgentStore((s) => s.setActiveSession);

  const handleNewSession = () => {
    createSession.mutate({}, {
      onSuccess: (newSession) => {
        setActiveSession(newSession.session_id);
      },
    });
  };

  return (
    <div className="w-60 border-r border-border bg-background flex flex-col">
      {/* New Session Button */}
      <div className="p-3">
        <Button
          className="w-full"
          variant="primary"
          onClick={handleNewSession}
          disabled={createSession.isPending}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Agent Session
        </Button>
      </div>

      <hr className="border-border" />

      {/* Budget Indicator */}
      <BudgetIndicator />

      <hr className="border-border" />

      {/* Session List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading && (
            <div className="text-sm text-subtle text-center py-8">
              Loading sessions...
            </div>
          )}
          {sessions && sessions.length === 0 && (
            <div className="text-sm text-subtle text-center py-8">
              No sessions yet. Create one to start!
            </div>
          )}
          {sessions?.map((session) => (
            <SessionCard key={session.session_id} session={session} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
