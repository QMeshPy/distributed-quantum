"use client";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/shared/components/panel/panel";
import { Progress } from "@/components/arc/progress/progress";
import type { RunDetail } from "../types";

export function RunMetricsPanel({ run }: { run: RunDetail }) {
  const progress = run.progress;
  const quantumResult = run.result?.quantumResult;
  const completionPct = progress
    ? Math.round(progress.completionRatio * 100)
    : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Panel className="border-border-subtle">
        <PanelHeader className="pb-2">
          <PanelTitle className="text-sm font-medium text-subtle">
            Execution Progress
          </PanelTitle>
        </PanelHeader>
        <PanelContent className="space-y-3">
          {progress ? (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground">
                  {completionPct}% complete
                </span>
                {progress.finalizing && (
                  <span className="text-xs text-subtle">
                    Finalizing…
                  </span>
                )}
              </div>
              <Progress value={completionPct ?? 0} className="h-2" />
              <div className="grid grid-cols-3 gap-2 pt-1 text-xs text-subtle">
                <div>
                  <p className="font-medium text-foreground">
                    {progress.totalFragments}
                  </p>
                  <p>Total</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    {progress.completedFragments}
                  </p>
                  <p>Done</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    {progress.activeFragments}
                  </p>
                  <p>Active</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-subtle">No progress data.</p>
          )}
        </PanelContent>
      </Panel>

      <Panel className="border-border-subtle">
        <PanelHeader className="pb-2">
          <PanelTitle className="text-sm font-medium text-subtle">
            Quantum Result
          </PanelTitle>
        </PanelHeader>
        <PanelContent>
          {quantumResult ? (
            <div className="space-y-2">
              {quantumResult.shots != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-subtle">Shots</span>
                  <span className="font-medium text-foreground">
                    {quantumResult.shots}
                  </span>
                </div>
              )}
              {quantumResult.topBasisStates &&
                quantumResult.topBasisStates.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-subtle">
                      Top basis states
                    </p>
                    {quantumResult.topBasisStates.slice(0, 5).map((state, i) => (
                      <div
                        key={i}
                        className="flex justify-between font-mono text-xs"
                      >
                        <span className="text-subtle">
                          {String(state.state ?? state.basis ?? i)}
                        </span>
                        <span className="text-foreground">
                          {typeof state.probability === "number"
                            ? `${(state.probability as number * 100).toFixed(2)}%`
                            : String(state.count ?? "")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              {!quantumResult.shots &&
                (!quantumResult.topBasisStates ||
                  quantumResult.topBasisStates.length === 0) && (
                  <p className="text-sm text-subtle">
                    Result available.
                  </p>
                )}
            </div>
          ) : (
            <p className="text-sm text-subtle">
              {run.status === "completed"
                ? "No quantum result."
                : "Awaiting completion."}
            </p>
          )}
        </PanelContent>
      </Panel>
    </div>
  );
}
