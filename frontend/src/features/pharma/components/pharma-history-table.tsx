"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import { usePharmaJobs } from "@/features/pharma/hooks/use-pharma-jobs";
import { ROUTES } from "@/constants";
import type { PharmaJobStatus } from "@/features/pharma/types";

const STATUS_STYLES: Record<PharmaJobStatus, { dot: string; text: string }> = {
  queued:    { dot: "bg-warning",                  text: "text-warning" },
  running:   { dot: "bg-info animate-pulse",      text: "text-info" },
  completed: { dot: "bg-success",                text: "text-success" },
  failed:    { dot: "bg-danger",                    text: "text-danger" },
  cancelled: { dot: "bg-surface-raised",                   text: "text-faint" },
};

export function PharmaHistoryTable() {
  const { data: jobs, isLoading } = usePharmaJobs();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 size={20} className="animate-spin text-faint" />
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="text-center py-16 text-faint text-sm">
        No pharma jobs yet.{" "}
        <a href={ROUTES.PHARMA_SUBMIT} className="text-accent hover:text-accent transition-colors hover:underline">
          Submit your first pipeline
        </a>
      </div>
    );
  }

  const sorted = [...jobs].sort(
    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
  );

  return (
    <SortableDataTable
      caption="Pharma jobs"
      rowKey="job_id"
      rows={sorted.map((job) => ({
        ...job,
        candidates: job.result ? job.result.candidates.length : null,
        runtime: job.result ? job.result.total_runtime_seconds : null,
      }))}
      columns={[
        {
          key: "status",
          label: "Status",
          sortable: true,
          render: (v, row) => {
            const style = STATUS_STYLES[v as PharmaJobStatus] ?? STATUS_STYLES.cancelled;
            return (
              <Link href={ROUTES.pharmaJob(row.job_id as string)} className="flex items-center gap-2 hover:underline">
                <span className={["h-1.5 w-1.5 shrink-0 rounded-full", style.dot].join(" ")} />
                <span className={["text-sm capitalize font-medium", style.text].join(" ")}>{v as string}</span>
              </Link>
            );
          },
        },
        { key: "target_pdb_id", label: "Target", sortable: true, render: (v) => <span className="font-mono">{v as string}</span> },
        { key: "mode", label: "Mode", sortable: true, render: (v) => <span className="capitalize">{v as string}</span> },
        { key: "candidates", label: "Candidates", sortable: true, numeric: true, render: (v) => (v === null ? "-" : String(v)) },
        { key: "runtime", label: "Runtime", sortable: true, numeric: true, render: (v) => (v === null ? "-" : `${(v as number).toFixed(1)}s`) },
        { key: "submitted_at", label: "Submitted", sortable: true, render: (v) => new Date(v as string).toLocaleString() },
      ]}
    />
  );
}
