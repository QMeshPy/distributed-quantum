"use client";

import React from "react";
import { CheckCircle2, AlertTriangle, XCircle, Globe, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardStats } from "../hooks/use-dashboard-data";
import { getHealthStatus, formatUptime } from "../lib/dashboard-transformers";

const STATUS_CONFIG = {
  healthy: {
    label: "Healthy",
    icon: CheckCircle2,
    gradient: "from-emerald-500/15 to-emerald-600/5",
    ring: "ring-emerald-500/20",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
    glow: "shadow-[0_0_16px_rgba(52,211,153,0.2)]",
  },
  degraded: {
    label: "Degraded",
    icon: AlertTriangle,
    gradient: "from-amber-500/15 to-amber-600/5",
    ring: "ring-amber-500/20",
    text: "text-amber-400",
    dot: "bg-amber-400",
    glow: "shadow-[0_0_16px_rgba(245,158,11,0.2)]",
  },
  critical: {
    label: "Critical",
    icon: XCircle,
    gradient: "from-red-500/15 to-red-600/5",
    ring: "ring-red-500/20",
    text: "text-red-400",
    dot: "bg-red-400",
    glow: "shadow-[0_0_16px_rgba(239,68,68,0.2)]",
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
        className={`relative overflow-hidden rounded-2xl p-5 ring-1 ${cfg.ring} ${cfg.glow} transition-all duration-300`}
        style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${cfg.gradient}`} />
        <div className="relative z-10">
          <div className="mb-3 flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-white/30" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
              Network Health
            </p>
          </div>
          {isLoading ? (
            <Skeleton className="h-7 w-24 bg-white/10" />
          ) : (
            <div className="flex items-center gap-2.5">
              <span className={`relative flex h-2.5 w-2.5`}>
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${cfg.dot} opacity-50`} />
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
              </span>
              <div className={`flex items-center gap-1.5 text-base font-semibold ${cfg.text}`}>
                <Icon className="h-4 w-4" />
                {cfg.label}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Environment card */}
      <div
        className="relative overflow-hidden rounded-2xl p-5 ring-1 ring-white/8 transition-all duration-300"
        style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/8 to-transparent" />
        <div className="relative z-10">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-white/30" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
              Environment
            </p>
          </div>
          <p className="text-base font-semibold text-white/80">
            {process.env.NODE_ENV === "production" ? "Production" : "Development"}
          </p>
          {uptime && (
            <p className="mt-1 text-xs text-white/30">Uptime: {uptime}</p>
          )}
        </div>
      </div>
    </div>
  );
}
