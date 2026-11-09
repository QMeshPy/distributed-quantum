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
  const router = useRouter();

  if (jobs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No risk jobs yet.
      </p>
    );
  }

  return (
    <div className="relative w-full overflow-x-auto">
      <Table className={cn(className)}>
        <TableHeader>
          <TableRow>
            <TableHead>Job ID</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Portfolio Size</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow
              key={job.jobId}
              onClick={() => router.push(ROUTES.riskDetail(job.jobId))}
              className="group relative cursor-pointer"
            >
              <TableCell className="font-mono text-xs">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-rose-500/10 via-rose-600/5 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                {job.jobId}
              </TableCell>
              <TableCell>{job.riskModel}</TableCell>
              <TableCell className="tabular-nums">{job.portfolioSize}</TableCell>
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
