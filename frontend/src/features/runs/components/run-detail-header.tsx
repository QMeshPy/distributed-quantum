"use client";
import { RunStatusBadge } from "./run-status-badge";
import { formatRelativeTime } from "@/features/dashboard/lib/dashboard-transformers";
import type { RunDetail } from "../types";

export function RunDetailHeader({ run }: { run: RunDetail }) {
  const now = new Date();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm text-subtle">
          {run.jobId}
        </span>
        <RunStatusBadge status={run.status} />
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-subtle">
        <span>Created {formatRelativeTime(run.createdAt, now)}</span>
        <span>Updated {formatRelativeTime(run.updatedAt, now)}</span>
        {run.planId && (
          <span>
            Plan:{" "}
            <span className="font-mono">{run.planId}</span>
          </span>
        )}
      </div>
      {run.error && (
        <div className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {run.error}
        </div>
      )}
    </div>
  );
}
