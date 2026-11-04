"use client";

import Link from "next/link";
import { Loader2, Users } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ROUTES } from "@/constants";
import { PEER_TASK_STATE } from "../lib/peer-task-state";
import type { PharmaJob } from "../types";
import type { LiveJobState, PeerTask } from "../types-live";

interface Props {
  job: PharmaJob;
  liveData: LiveJobState | null | undefined;
  isRunning: boolean;
}

function shortId(peerId: string): string {
  return peerId.length > 16 ? `${peerId.slice(0, 8)}…${peerId.slice(-6)}` : peerId;
}

function elapsed(task: PeerTask, serverTime: number): string | null {
  if (task.seconds !== null) return `${task.seconds.toFixed(1)}s`;
  if (task.state === "running" && task.started_at !== null && serverTime > 0) {
    return `${Math.max(0, serverTime - task.started_at).toFixed(0)}s`;
  }
  return null;
}

function TaskRow({ task, serverTime }: { task: PeerTask; serverTime: number }) {
  const meta = PEER_TASK_STATE[task.state];
  const time = elapsed(task, serverTime);
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="truncate text-[12px] font-semibold text-white/80">
          {task.peer ?? "Waiting for a peer"}
        </span>
        <span
          className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.badge}`}
        >
          {task.state === "running" && <Loader2 size={9} className="animate-spin" />}
          {meta.label}
        </span>
      </div>
      <div className="flex items-center gap-2 font-mono text-[10px] text-white/30">
        {task.peer_id && <span title={task.peer_id}>{shortId(task.peer_id)}</span>}
        <span>start {task.start}</span>
        {time && <span className="ml-auto tabular-nums text-white/45">{time}</span>}
      </div>
      {task.error && <p className="font-mono text-[10px] text-red-400/80">{task.error}</p>}
    </div>
  );
}

function groupByFragment(tasks: PeerTask[]): [string, PeerTask[]][] {
  const groups = new Map<string, PeerTask[]>();
  for (const task of tasks) groups.set(task.fragment, [...(groups.get(task.fragment) ?? []), task]);
  return [...groups.entries()];
}

export function PharmaPeersPanel({ job, liveData, isRunning }: Props) {
  const tasks = liveData?.peer_tasks ?? [];
  const serverTime = liveData?.server_time ?? 0;
  // The backend drops its live state when the job ends, so a finished job shows the final mapping.
  const finalMapping = Object.entries(job.result?.fragments_distributed ?? {});
  // VQE log lines are hidden from the main feed; here they are the peer events (reroutes, drops).
  const peerEvents = (job.log_lines ?? []).filter((l) => l.level === "vqe").slice(-8);

  return (
    <div className="flex flex-col gap-4 p-4">
      {tasks.length > 0 ? (
        groupByFragment(tasks).map(([fragment, group]) => (
          <section key={fragment} className="flex flex-col gap-2">
            <h3 className="font-mono text-[11px] text-emerald-300/80">Fragment {fragment}</h3>
            {group.map((task) => (
              <TaskRow key={task.task} task={task} serverTime={serverTime} />
            ))}
          </section>
        ))
      ) : finalMapping.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/30">
            Computed by
          </h3>
          {finalMapping.map(([fragmentId, peers]) => (
            <div
              key={fragmentId}
              className="rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2"
            >
              <p className="font-mono text-[10px] text-white/30">{fragmentId}</p>
              <p className="text-[12px] font-semibold text-white/80">{peers}</p>
            </div>
          ))}
        </section>
      ) : (
        <p className="text-[12px] text-white/35">
          {isRunning
            ? "Peer tasks appear here when the drug-discovery stage starts."
            : "No peer data was recorded for this job."}
        </p>
      )}

      {peerEvents.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/30">
            Recent events
          </h3>
          {peerEvents.map((entry, index) => (
            <p key={index} className="font-mono text-[10px] leading-relaxed text-white/45">
              {entry.message}
            </p>
          ))}
        </section>
      )}

      <Link
        href={ROUTES.NETWORK_MESH}
        className="text-[11px] text-sky-300/80 underline-offset-2 hover:underline"
      >
        Open the network mesh page for full peer details
      </Link>
    </div>
  );
}

export function PharmaPeersDrawer({ job, liveData, isRunning }: Props) {
  const tasks = liveData?.peer_tasks ?? [];
  const activePeers = new Set(tasks.filter((t) => t.peer_id).map((t) => t.peer_id)).size;
  const doneCount = tasks.filter((t) => t.state === "done").length;
  const runningCount = tasks.filter((t) => t.state === "running").length;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-white/60 transition-colors hover:bg-white/[0.06]"
        >
          <Users size={12} />
          Peers
          {isRunning && runningCount > 0 && (
            <span className="rounded-full bg-sky-400/15 px-1.5 text-[10px] text-sky-300">
              {runningCount}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-white/6">
          <SheetTitle>Peers on this job</SheetTitle>
          <SheetDescription>
            {tasks.length > 0
              ? `${activePeers} peer${activePeers === 1 ? "" : "s"} · ${doneCount} of ${tasks.length} tasks done this iteration`
              : "Which machines computed which fragment"}
          </SheetDescription>
        </SheetHeader>
        <PharmaPeersPanel job={job} liveData={liveData} isRunning={isRunning} />
      </SheetContent>
    </Sheet>
  );
}
