"use client";

import { Button } from "@/components/arc/button/button";

import Link from "next/link";
import { Loader2, Users } from "lucide-react";
import { Drawer, DrawerTrigger, DrawerContent } from "@/components/arc/drawer/drawer";
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
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface-muted px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="truncate text-xs font-medium text-foreground">
          {task.peer ?? "Waiting for a peer"}
        </span>
        <span
          className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.badge}`}
        >
          {task.state === "running" && <Loader2 size={9} className="animate-spin" />}
          {meta.label}
        </span>
      </div>
      <div className="flex items-center gap-2 font-mono text-xs text-faint">
        {task.peer_id && <span title={task.peer_id}>{shortId(task.peer_id)}</span>}
        <span>start {task.start}</span>
        {time && <span className="ml-auto tabular-nums text-subtle">{time}</span>}
      </div>
      {task.error && <p className="font-mono text-xs text-danger">{task.error}</p>}
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
            <h3 className="font-mono text-xs text-success">Fragment {fragment}</h3>
            {group.map((task) => (
              <TaskRow key={task.task} task={task} serverTime={serverTime} />
            ))}
          </section>
        ))
      ) : finalMapping.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-faint">
            Computed by
          </h3>
          {finalMapping.map(([fragmentId, peers]) => (
            <div
              key={fragmentId}
              className="rounded-lg border border-border bg-surface-muted px-3 py-2"
            >
              <p className="font-mono text-xs text-faint">{fragmentId}</p>
              <p className="text-xs font-medium text-foreground">{peers}</p>
            </div>
          ))}
        </section>
      ) : (
        <p className="text-xs text-faint">
          {isRunning
            ? "Peer tasks appear here when the drug-discovery stage starts."
            : "No peer data was recorded for this job."}
        </p>
      )}

      {peerEvents.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-faint">
            Recent events
          </h3>
          {peerEvents.map((entry, index) => (
            <p key={index} className="font-mono text-xs leading-relaxed text-subtle">
              {entry.message}
            </p>
          ))}
        </section>
      )}

      <Link
        href={ROUTES.NETWORK_MESH}
        className="text-xs text-info underline-offset-2 hover:underline"
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
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="secondary" size="sm"
          type="button">
          <Users size={12} />
          Peers
          {isRunning && runningCount > 0 && (
            <span className="rounded-full bg-info/15 px-1.5 text-xs text-info">
              {runningCount}
            </span>
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent
        title="Peers on this job"
        description={
          tasks.length > 0
            ? `${activePeers} peer${activePeers === 1 ? "" : "s"} · ${doneCount} of ${tasks.length} tasks done this iteration`
            : "Which machines computed which fragment"
        }
        side="right"
      >
        <PharmaPeersPanel job={job} liveData={liveData} isRunning={isRunning} />
      </DrawerContent>
    </Drawer>
  );
}
