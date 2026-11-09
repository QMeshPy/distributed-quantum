"use client";
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import Link from "next/link";
import { Badge } from "@/components/arc/badge/badge";
import { legacyBadge } from "@/lib/legacy-badge";
import { ROUTES } from "@/constants";
import type { RiskJobSummary } from "../types";

interface RiskHistoryTableProps {
  jobs: RiskJobSummary[];
  className?: string;
}

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "failed") return "destructive";
  if (status === "processing" || status === "queued") return "secondary";
  return "outline";
}

export function RiskHistoryTable({ jobs, className }: RiskHistoryTableProps) {
  if (jobs.length === 0) {
    return (
      <p className="text-sm text-subtle py-6 text-center">
        No risk jobs yet.
      </p>
    );
  }

  return (
    <div className={className}>
      <SortableDataTable
        caption="Job history"
        rows={jobs.map((job) => ({ ...job }))}
        rowKey="jobId"
        columns={[
          {
            key: "jobId",
            label: "Job ID",
            sortable: true,
            render: (_, job) => (
              <Link href={ROUTES.riskDetail(job.jobId as string)} className="font-mono text-xs hover:underline">
                {job.jobId as string}
              </Link>
            ),
          },
          { key: "riskModel", label: "Model", sortable: true },
          { key: "portfolioSize", label: "Portfolio Size", sortable: true, numeric: true },
          {
            key: "status",
            label: "Status",
            sortable: true,
            render: (_, job) => <Badge {...legacyBadge(statusVariant(job.status as string))}>{job.status as string}</Badge>,
          },
          {
            key: "createdAt",
            label: "Created",
            sortable: true,
            render: (_, job) => new Date(job.createdAt as string).toLocaleString(),
          },
        ]}
      />
    </div>
  );
}
