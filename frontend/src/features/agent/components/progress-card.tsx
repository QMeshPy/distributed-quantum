"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Workflow } from "../types";

interface ProgressCardProps {
  workflow: Workflow;
}

export function ProgressCard({ workflow }: ProgressCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {workflow.current_step_name || "Processing..."}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={workflow.progress_percent} />
        <div className="text-xs text-white/60">
          {workflow.progress_percent.toFixed(0)}% complete
        </div>
        <div className="text-xs text-white/40">
          Step {workflow.current_step + 1} of {workflow.total_steps}
        </div>
      </CardContent>
    </Card>
  );
}
