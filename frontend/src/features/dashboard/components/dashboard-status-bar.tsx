"use client";

import { CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";
import { useDashboardStats } from "../hooks/use-dashboard-data";
import { getHealthStatus, formatUptime } from "../lib/dashboard-transformers";

const HEALTH_CFG = {
  healthy:  { icon: CheckCircle2, label: "Healthy",  className: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20", dot: "bg-emerald-400" },
  degraded: { icon: AlertTriangle, label: "Degraded", className: "text-amber-400   bg-amber-500/10   ring-amber-500/20",   dot: "bg-amber-400"   },
  critical: { icon: XCircle,       label: "Critical", className: "text-red-400     bg-red-500/10     ring-red-500/20",     dot: "bg-red-400"     },
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
      <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 ring-1 ring-emerald-500/20 bg-emerald-500/8">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </span>
        <span className="text-xs font-medium text-emerald-400">Live</span>
      </div>

      {/* Health status */}
      <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium ring-1 ${cfg.className}`}>
        <Icon className="h-3 w-3" />
        {cfg.label}
      </div>

      {/* Env + uptime */}
      <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-white/40 ring-1 ring-white/8 bg-white/4">
        <Clock className="h-3 w-3" />
        {env}{uptime ? ` · ${uptime}` : ""}
      </div>
    </div>
  );
}
