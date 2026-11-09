"use client";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">Failed to load runs.</p>
    );
  }

  if (!runs || runs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">No runs yet.</p>
        <Button asChild size="sm">
          <Link href={ROUTES.RUNS_NEW}>
            <Plus size={16} />
            Start your first run
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Job ID</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Circuit</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow key={run.jobId}>
            <TableCell className="font-mono text-xs">
              <Link
                href={ROUTES.runDetail(run.jobId)}
                className="text-foreground hover:underline"
              >
                {truncate(run.jobId, 16)}
              </Link>
            </TableCell>
            <TableCell>
              <RunStatusBadge status={run.status} />
            </TableCell>
            <TableCell className="max-w-xs truncate font-mono text-xs text-muted-foreground">
              {truncate(run.circuitPreview, 40)}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {formatRelativeTime(run.createdAt, now)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
