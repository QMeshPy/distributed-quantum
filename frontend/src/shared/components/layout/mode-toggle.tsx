"use client";

import { useWorkspaceMode } from "@/shared/stores/workspace-mode-store";
import { cn } from "@/lib/utils";

export function ModeToggle() {
  const { mode, setMode, hasActiveExecution } = useWorkspaceMode();

  const handleModeChange = async (newMode: "manual" | "agent") => {
    if (mode === "agent" && hasActiveExecution) {
      const confirmed = window.confirm(
        "Agent is executing a workflow. Switch anyway? (Execution will be paused)"
      );
      if (!confirmed) return;
    }
    setMode(newMode);
  };

  return (
    <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
      <button
        onClick={() => handleModeChange("manual")}
        className={cn(
          "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
          mode === "manual"
            ? "bg-white/10 text-white"
            : "text-white/50 hover:text-white/80"
        )}
      >
        Manual
      </button>
      <button
        onClick={() => handleModeChange("agent")}
        className={cn(
          "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
          mode === "agent"
            ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30"
            : "text-white/50 hover:text-white/80"
        )}
      >
        Agent
      </button>
    </div>
  );
}
