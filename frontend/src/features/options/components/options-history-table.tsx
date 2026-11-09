"use client";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/constants";
import type { OptionsJobSummary } from "../types";

interface OptionsHistoryTableProps {
  jobs: OptionsJobSummary[];
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

export function OptionsHistoryTable({
  jobs,
  className,
}: OptionsHistoryTableProps) {
  const router = useRouter();

  if (jobs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No options jobs yet.
      </p>
    );
  }

  return (
    <div className="relative w-full overflow-x-auto">
      <Table className={cn(className)}>
        <TableHeader>
          <TableRow>
            <TableHead>Job ID</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow
              key={job.jobId}
              onClick={() => router.push(ROUTES.optionsDetail(job.jobId))}
              className="group relative cursor-pointer"
            >
              <TableCell className="font-mono text-xs">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-amber-500/10 via-amber-600/5 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                {job.jobId}
              </TableCell>
              <TableCell>{job.optionType}</TableCell>
              <TableCell>
                <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {new Date(job.createdAt).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
