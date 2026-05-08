export const RUN_STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  compiling: "Compiling",
  reserving: "Reserving nodes",
  executing: "Executing",
  completed: "Completed",
  failed: "Failed",
};

export const RUN_STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  queued: "outline",
  compiling: "secondary",
  reserving: "secondary",
  executing: "secondary",
  completed: "default",
  failed: "destructive",
};
