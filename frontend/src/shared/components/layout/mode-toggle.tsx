"use client";

import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { useWorkspaceMode } from "@/shared/stores/workspace-mode-store";

export function ModeToggle() {
  const { mode, setMode, hasActiveExecution } = useWorkspaceMode();

  const handleModeChange = (value: string) => {
    const newMode = value as "manual" | "agent";
    if (mode === "agent" && hasActiveExecution) {
      const confirmed = window.confirm(
        "Agent is executing a workflow. Switch anyway? (Execution will be paused)"
      );
      if (!confirmed) return;
    }
    setMode(newMode);
  };

  return (
    <SegmentedControl
      label="Workspace mode"
      value={mode}
      onValueChange={handleModeChange}
      options={[
        { value: "manual", label: "Manual" },
        { value: "agent", label: "Agent" },
      ]}
    />
  );
}
