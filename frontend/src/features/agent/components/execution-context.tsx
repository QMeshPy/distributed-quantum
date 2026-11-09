"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/arc/tabs/tabs";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/shared/components/panel/panel";
import { ScrollArea } from "@/components/arc/scroll-area/scroll-area";
import { Badge } from "@/components/arc/badge/badge";
import { legacyBadge } from "@/lib/legacy-badge";
import { useAgentSession } from "../hooks/use-agent-session";
import { useAgentStore } from "../stores/agent-store";
import { ProgressCard } from "./progress-card";

interface ExecutionContextProps {
  sessionId: string | null;
}

export function ExecutionContext({ sessionId }: ExecutionContextProps) {
  const { data: session } = useAgentSession(sessionId);
  const { executionView, setExecutionView } = useAgentStore();

  if (!sessionId || !session) {
    return (
      <div className="w-96 border-l border-border bg-background flex items-center justify-center">
        <div className="text-sm text-subtle text-center p-6">
          Select a session to view execution details
        </div>
      </div>
    );
  }

  return (
    <div className="w-96 border-l border-border bg-background flex flex-col">
      <Tabs value={executionView} onValueChange={(v) => setExecutionView(v as any)} className="flex-1 flex flex-col">
        <div className="border-b border-border px-4 pt-3">
          <TabsList className="w-full">
            <TabsTrigger value="results" className="flex-1">Results</TabsTrigger>
            <TabsTrigger value="technical" className="flex-1">Technical</TabsTrigger>
            <TabsTrigger value="logs" className="flex-1">Logs</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="results" className="flex-1 m-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {session.workflow && (
                <ProgressCard workflow={session.workflow} />
              )}

              <Panel>
                <PanelHeader>
                  <PanelTitle className="text-sm">Metrics</PanelTitle>
                </PanelHeader>
                <PanelContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-subtle">Cost</span>
                    <span className="font-medium">${session.cost.actual.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-subtle">Time Elapsed</span>
                    <span className="font-medium">
                      {Math.floor(session.time.elapsed_seconds / 60)}m {session.time.elapsed_seconds % 60}s
                    </span>
                  </div>
                  {session.workflow && (
                    <div className="flex justify-between text-sm">
                      <span className="text-subtle">Steps Completed</span>
                      <span className="font-medium">
                        {session.workflow.completed_steps} / {session.workflow.total_steps}
                      </span>
                    </div>
                  )}
                </PanelContent>
              </Panel>

              {session.results != null && (
                <Panel>
                  <PanelHeader>
                    <PanelTitle className="text-sm">Results</PanelTitle>
                  </PanelHeader>
                  <PanelContent>
                    <pre className="text-xs text-foreground whitespace-pre-wrap overflow-auto max-h-96">
                      {typeof session.results === 'string'
                        ? session.results
                        : JSON.stringify(session.results, null, 2)}
                    </pre>
                  </PanelContent>
                </Panel>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="technical" className="flex-1 m-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {session.workflow && (
                <Panel>
                  <PanelHeader>
                    <PanelTitle className="text-sm">Workflow Steps</PanelTitle>
                  </PanelHeader>
                  <PanelContent>
                    {session.workflow.steps.map((step) => (
                      <div key={step.id} className="flex items-center gap-2 py-2 border-b border-border last:border-0">
                        <Badge {...legacyBadge(step.status === "completed" ? "secondary" :
                          step.status === "running" ? "default" :
                          step.status === "failed" ? "destructive" :
                          "outline")} className="shrink-0 text-xs">
                          {step.status}
                        </Badge>
                        <span className="text-sm flex-1">{step.name}</span>
                        {step.progress_percent !== undefined && (
                          <span className="text-xs text-subtle">{step.progress_percent}%</span>
                        )}
                      </div>
                    ))}
                  </PanelContent>
                </Panel>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="logs" className="flex-1 m-0">
          <ScrollArea className="h-full">
            <div className="p-4 font-mono text-xs space-y-1">
              {session.logs && session.logs.length > 0 ? (
                session.logs.map((log, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span className="text-subtle shrink-0">{log.timestamp}</span>
                    <Badge outline className="shrink-0 text-xs">
                      {log.level}
                    </Badge>
                    <span className="text-foreground">{log.message}</span>
                  </div>
                ))
              ) : (
                <div className="text-subtle text-center py-12">
                  No logs yet
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
