"use client";
import Link from "next/link";
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { LinkButton } from "@/shared/components/link-button";
import { Plus } from "lucide-react";
import { useRunsList } from "../hooks/use-runs-list";
import { RunStatusBadge } from "./run-status-badge";
import { ROUTES } from "@/constants";
import { formatRelativeTime } from "@/features/dashboard/lib/dashboard-transformers";

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return `${str.slice(0, max)}…`;
}

export function RunsTable() {
  const { data: runs, isLoading, isError } = useRunsList();
  const now = new Date();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton lines={2} key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-subtle">Failed to load runs.</p>
    );
  }

  if (!runs || runs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-sm text-subtle">No runs yet.</p>
        <LinkButton href={ROUTES.RUNS_NEW} size="sm">
            <Plus size={16} />
            Start your first run
          </LinkButton>
      </div>
    );
  }

  return (
    <SortableDataTable
      caption="Runs"
      rows={runs.map((run) => ({ ...run }))}
      rowKey="jobId"
      columns={[
        {
          key: "jobId",
          label: "Job ID",
          sortable: true,
          render: (_, run) => (
            <Link href={ROUTES.runDetail(run.jobId as string)} className="font-mono text-xs hover:underline">
              {truncate(run.jobId as string, 16)}
            </Link>
          ),
        },
        { key: "status", label: "Status", sortable: true, render: (_, run) => <RunStatusBadge status={run.status as typeof runs[number]["status"]} /> },
        { key: "circuitPreview", label: "Circuit", render: (_, run) => <span className="font-mono text-xs">{truncate(run.circuitPreview as string, 40)}</span> },
        { key: "createdAt", label: "Created", sortable: true, render: (_, run) => formatRelativeTime(run.createdAt as typeof runs[number]["createdAt"], now) },
      ]}
    />
  );
}
