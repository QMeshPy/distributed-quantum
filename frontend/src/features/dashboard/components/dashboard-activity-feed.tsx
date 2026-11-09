"use client";

import React from "react";
import { CheckCircle2, Loader2, XCircle, Clock, FlaskConical, TrendingUp, BarChart3, DollarSign, Activity, Zap } from "lucide-react";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { useActivityFeed, type ActivityItem } from "../hooks/use-activity-feed";

const STATUS_CONFIG: Record<ActivityItem["status"], { icon: React.ElementType; className: string; bg: string }> = {
  completed: { icon: CheckCircle2, className: "text-success", bg: "bg-success/15" },
  running: { icon: Loader2, className: "text-accent", bg: "bg-accent/15" },
  failed: { icon: XCircle, className: "text-danger", bg: "bg-danger/15" },
  pending: { icon: Clock, className: "text-faint", bg: "bg-surface-muted" },
};

const TYPE_CONFIG: Record<ActivityItem["type"], { icon: React.ElementType; label: string; bg: string; text: string }> = {
  run: { icon: FlaskConical, label: "Quantum Run", bg: "bg-accent/15", text: "text-accent" },
  options: { icon: TrendingUp, label: "Options", bg: "bg-warning/15", text: "text-warning" },
  risk: { icon: BarChart3, label: "Risk", bg: "bg-accent/15", text: "text-accent" },
  finance: { icon: DollarSign, label: "Finance", bg: "bg-info/15", text: "text-info" },
};

export function DashboardActivityFeed() {
  const { data, isLoading } = useActivityFeed(5);
  const items: ActivityItem[] = data?.items ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Zap className="h-3.5 w-3.5 text-accent animate-pulse" />
        <h2 className="text-xs font-medium text-faint">Recent Activity</h2>
      </div>

      <div
        className="overflow-hidden rounded-2xl ring-1 ring-border"
        style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
      >
        {isLoading ? (
          <div className="flex flex-col gap-px p-4">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton lines={2} key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-muted">
              <Activity className="h-5 w-5 text-faint" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-subtle">No recent activity</p>
              <p className="mt-0.5 text-xs text-faint">Run a quantum job to see it here</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => {
              const StatusIcon = STATUS_CONFIG[item.status].icon;
              const TypeIcon = TYPE_CONFIG[item.type].icon;
              return (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted transition-colors">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TYPE_CONFIG[item.type].bg} ${TYPE_CONFIG[item.type].text}`}>
                    <TypeIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-faint">{TYPE_CONFIG[item.type].label}</p>
                  </div>
                  <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CONFIG[item.status].bg} ${STATUS_CONFIG[item.status].className}`}>
                    <StatusIcon className={`h-3 w-3 ${item.status ==="running" ? "animate-spin" : ""}`} />
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
