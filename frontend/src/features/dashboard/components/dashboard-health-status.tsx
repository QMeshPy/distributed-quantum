"use client";

import React from "react";
import { CheckCircle2, AlertTriangle, XCircle, Globe, Clock } from "lucide-react";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { useDashboardStats } from "../hooks/use-dashboard-data";
import { getHealthStatus, formatUptime } from "../lib/dashboard-transformers";

const STATUS_CONFIG = {
  healthy: {
    label: "Healthy",
    icon: CheckCircle2,
    ring: "ring-success/20",
    text: "text-success",
    dot: "bg-success",
    },
  degraded: {
    label: "Degraded",
    icon: AlertTriangle,
    ring: "ring-warning/20",
    text: "text-warning",
    dot: "bg-warning",
    },
  critical: {
    label: "Critical",
    icon: XCircle,
    ring: "ring-danger/20",
    text: "text-danger",
    dot: "bg-danger",
    },
} as const;

export function DashboardHealthStatus() {
  const { data, isLoading } = useDashboardStats();
  const fidelity = data?.avgFidelity ?? 0;
  const status = getHealthStatus(fidelity);
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  const uptime = data?.health ? formatUptime((data.health as { uptimeSeconds?: number }).uptimeSeconds ?? 0) : null;

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Health card */}
      <div
        className={`relative overflow-hidden rounded-2xl p-5 ring-1 ${cfg.ring} transition-all duration-300`}
        style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
      >
        <div className="relative z-10">
          <div className="mb-3 flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-faint" />
            <p className="text-xs font-medium text-faint">
              Network Health
            </p>
          </div>
          {isLoading ? (
            <Skeleton lines={1} className="h-7 w-24" />
          ) : (
            <div className="flex items-center gap-2.5">
              <span className={`relative flex h-2.5 w-2.5`}>
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${cfg.dot} opacity-50`} />
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
              </span>
              <div className={`flex items-center gap-1.5 text-base font-medium ${cfg.text}`}>
                <Icon className="h-4 w-4" />
                {cfg.label}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Environment card */}
      <div
        className="relative overflow-hidden rounded-2xl p-5 ring-1 ring-border transition-all duration-300"
        style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
      >
        <div className="absolute inset-0" />
        <div className="relative z-10">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-faint" />
            <p className="text-xs font-medium text-faint">
              Environment
            </p>
          </div>
          <p className="text-base font-medium text-foreground">
            {process.env.NODE_ENV === "production" ? "Production" : "Development"}
          </p>
          {uptime && (
            <p className="mt-1 text-xs text-faint">Uptime: {uptime}</p>
          )}
        </div>
      </div>
    </div>
  );
}
