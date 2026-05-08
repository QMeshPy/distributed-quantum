"use client";

import React from "react";
import { CheckCircle2, Loader2, XCircle, Clock, FlaskConical, TrendingUp, BarChart3, DollarSign, Activity, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivityFeed, type ActivityItem } from "../hooks/use-activity-feed";

const STATUS_CONFIG: Record<ActivityItem["status"], { icon: React.ElementType; className: string; bg: string }> = {
  completed: { icon: CheckCircle2, className: "text-emerald-400", bg: "bg-emerald-500/15" },
  running: { icon: Loader2, className: "text-indigo-400", bg: "bg-indigo-500/15" },
  failed: { icon: XCircle, className: "text-red-400", bg: "bg-red-500/15" },
  pending: { icon: Clock, className: "text-white/30", bg: "bg-white/6" },
};

const TYPE_CONFIG: Record<ActivityItem["type"], { icon: React.ElementType; label: string; bg: string; text: string }> = {
  run: { icon: FlaskConical, label: "Quantum Run", bg: "bg-indigo-500/15", text: "text-indigo-400" },
  options: { icon: TrendingUp, label: "Options", bg: "bg-orange-500/15", text: "text-orange-400" },
  risk: { icon: BarChart3, label: "Risk", bg: "bg-violet-500/15", text: "text-violet-400" },
  finance: { icon: DollarSign, label: "Finance", bg: "bg-cyan-500/15", text: "text-cyan-400" },
};

export function DashboardActivityFeed() {
  const { data, isLoading } = useActivityFeed(5);
  const items: ActivityItem[] = data?.items ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Zap className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Recent Activity</h2>
      </div>

      <div
        className="overflow-hidden rounded-2xl ring-1 ring-white/8"
        style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
      >
        {isLoading ? (
          <div className="flex flex-col gap-px p-4">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl bg-white/5" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5">
              <Activity className="h-5 w-5 text-white/20" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-white/40">No recent activity</p>
              <p className="mt-0.5 text-xs text-white/20">Run a quantum job to see it here</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {items.map((item) => {
              const StatusIcon = STATUS_CONFIG[item.status].icon;
              const TypeIcon = TYPE_CONFIG[item.type].icon;
              return (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TYPE_CONFIG[item.type].bg} ${TYPE_CONFIG[item.type].text}`}>
                    <TypeIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white/80">{item.label}</p>
                    <p className="text-xs text-white/30">{TYPE_CONFIG[item.type].label}</p>
                  </div>
                  <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CONFIG[item.status].bg} ${STATUS_CONFIG[item.status].className}`}>
                    <StatusIcon className={`h-3 w-3 ${item.status === "running" ? "animate-spin" : ""}`} />
                    <span className="capitalize">{item.status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
