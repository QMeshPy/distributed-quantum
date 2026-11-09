"use client";

import { CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";
import { useDashboardStats } from "../hooks/use-dashboard-data";
import { getHealthStatus, formatUptime } from "../lib/dashboard-transformers";

const HEALTH_CFG = {
  healthy:  { icon: CheckCircle2, label: "Healthy",  className: "text-success bg-success/10 ring-success/20", dot: "bg-success" },
  degraded: { icon: AlertTriangle, label: "Degraded", className: "text-warning   bg-warning/10   ring-warning/20",   dot: "bg-warning"   },
  critical: { icon: XCircle,       label: "Critical", className: "text-danger     bg-danger/10     ring-danger/20",     dot: "bg-danger"     },
} as const;

export function DashboardStatusBar() {
  const { data } = useDashboardStats();
  const status = getHealthStatus(data?.avgFidelity ?? 0);
  const cfg = HEALTH_CFG[status];
  const Icon = cfg.icon;
  const uptime = data?.health
    ? formatUptime((data.health as { uptimeSeconds?: number }).uptimeSeconds ?? 0)
    : null;
  const env = process.env.NODE_ENV === "production" ? "Production" : "Development";

  return (
    <div className="flex items-center gap-2">
      {/* Live ping */}
      <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 ring-1 ring-success/20 bg-success/8">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
        </span>
        <span className="text-xs font-medium text-success">Live</span>
      </div>

      {/* Health status */}
      <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium ring-1 ${cfg.className}`}>
        <Icon className="h-3 w-3" />
        {cfg.label}
      </div>

      {/* Env + uptime */}
      <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-subtle ring-1 ring-border bg-surface-muted">
        <Clock className="h-3 w-3" />
        {env}{uptime ? ` · ${uptime}` : ""}
      </div>
    </div>
  );
}
