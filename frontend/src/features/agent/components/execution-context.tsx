"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
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
      <div className="w-96 border-l border-white/10 bg-background flex items-center justify-center">
        <div className="text-sm text-white/40 text-center p-6">
          Select a session to view execution details
        </div>
      </div>
    );
  }

  return (
    <div className="w-96 border-l border-white/10 bg-background flex flex-col">
      <Tabs value={executionView} onValueChange={(v) => setExecutionView(v as any)} className="flex-1 flex flex-col">
        <div className="border-b border-white/10 px-4 pt-3">
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

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Metrics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Cost</span>
                    <span className="font-medium">${session.cost.actual.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Time Elapsed</span>
                    <span className="font-medium">
                      {Math.floor(session.time.elapsed_seconds / 60)}m {session.time.elapsed_seconds % 60}s
                    </span>
                  </div>
                  {session.workflow && (
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">Steps Completed</span>
                      <span className="font-medium">
                        {session.workflow.completed_steps} / {session.workflow.total_steps}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {session.results != null && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Results</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs text-white/80 whitespace-pre-wrap overflow-auto max-h-96">
                      {typeof session.results === 'string'
                        ? session.results
                        : JSON.stringify(session.results, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="technical" className="flex-1 m-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {session.workflow && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Workflow Steps</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {session.workflow.steps.map((step) => (
                      <div key={step.id} className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0">
                        <Badge variant={
                          step.status === "completed" ? "secondary" :
                          step.status === "running" ? "default" :
                          step.status === "failed" ? "destructive" :
                          "outline"
                        } className="shrink-0 text-xs">
                          {step.status}
                        </Badge>
                        <span className="text-sm flex-1">{step.name}</span>
                        {step.progress_percent !== undefined && (
                          <span className="text-xs text-white/40">{step.progress_percent}%</span>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
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
                    <span className="text-white/40 shrink-0">{log.timestamp}</span>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {log.level}
                    </Badge>
                    <span className="text-white/80">{log.message}</span>
                  </div>
                ))
              ) : (
                <div className="text-white/40 text-center py-12">
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
