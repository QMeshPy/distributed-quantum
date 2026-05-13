"use client";

import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { usePharmaJobs } from "@/features/pharma/hooks/use-pharma-jobs";
import { ROUTES } from "@/constants";
import type { PharmaJobStatus } from "@/features/pharma/types";

const STATUS_STYLES: Record<PharmaJobStatus, { dot: string; text: string }> = {
  queued:    { dot: "bg-amber-400",                  text: "text-amber-300" },
  running:   { dot: "bg-sky-400 animate-pulse",      text: "text-sky-300" },
  completed: { dot: "bg-emerald-400",                text: "text-emerald-400" },
  failed:    { dot: "bg-red-400",                    text: "text-red-400" },
  cancelled: { dot: "bg-white/20",                   text: "text-white/30" },
};

export function PharmaHistoryTable() {
  const router = useRouter();
  const { data: jobs, isLoading } = usePharmaJobs();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 size={20} className="animate-spin text-white/20" />
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="text-center py-16 text-white/25 text-sm">
        No pharma jobs yet.{" "}
        <a href={ROUTES.PHARMA_SUBMIT} className="text-indigo-400 hover:text-indigo-300 transition-colors hover:underline">
          Submit your first pipeline
        </a>
      </div>
    );
  }

  const sorted = [...jobs].sort(
    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
  );

  return (
    <div className="rounded-xl border border-white/6 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/6 bg-white/[0.025]">
            {["Status", "Target", "Mode", "Candidates", "Runtime", "Submitted"].map((h) => (
              <th
                key={h}
                className="px-5 py-3.5 text-left text-[10px] text-white/30 uppercase tracking-wider font-semibold"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((job, idx) => {
            const style = STATUS_STYLES[job.status] ?? STATUS_STYLES.cancelled;
            return (
              <tr
                key={job.job_id}
                onClick={() => router.push(ROUTES.pharmaJob(job.job_id))}
                className={[
                  "group relative cursor-pointer border-b border-white/5 transition-colors hover:bg-emerald-400/[0.04]",
                  idx === sorted.length - 1 ? "border-b-0" : "",
                ].join(" ")}
              >
                <td className="px-5 py-4">
                  <span className="flex items-center gap-2">
                    <span className={["w-1.5 h-1.5 rounded-full shrink-0", style.dot].join(" ")} />
                    <span className={["text-[13px] capitalize font-medium", style.text].join(" ")}>
                      {job.status}
                    </span>
                  </span>
                </td>
                <td className="px-5 py-4 font-mono text-[13px] text-white/70">{job.target_pdb_id}</td>
                <td className="px-5 py-4 capitalize text-[13px] text-white/45">{job.mode}</td>
                <td className="px-5 py-4 text-[13px] text-white/60">
                  {job.result ? job.result.candidates.length : <span className="text-white/20">—</span>}
                </td>
                <td className="px-5 py-4 text-[13px] text-white/60">
                  {job.result ? `${job.result.total_runtime_seconds.toFixed(1)}s` : <span className="text-white/20">—</span>}
                </td>
                <td className="px-5 py-4 text-[11px] text-white/25">
                  {new Date(job.submitted_at).toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
