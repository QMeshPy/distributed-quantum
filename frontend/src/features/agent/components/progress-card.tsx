"use client";

import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/shared/components/panel/panel";
import { Progress } from "@/components/arc/progress/progress";
import type { Workflow } from "../types";

interface ProgressCardProps {
  workflow: Workflow;
}

export function ProgressCard({ workflow }: ProgressCardProps) {
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle className="text-sm">
          {workflow.current_step_name || "Processing..."}
        </PanelTitle>
      </PanelHeader>
      <PanelContent className="space-y-3">
        <Progress value={workflow.progress_percent} />
        <div className="text-xs text-subtle">
          {workflow.progress_percent.toFixed(0)}% complete
        </div>
        <div className="text-xs text-subtle">
          Step {workflow.current_step + 1} of {workflow.total_steps}
        </div>
      </PanelContent>
    </Panel>
  );
}
