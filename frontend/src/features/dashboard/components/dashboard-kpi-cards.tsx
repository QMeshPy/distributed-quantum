"use client";

import React from "react";
import { Server, Layers, Gauge, Cpu } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardStats } from "../hooks/use-dashboard-data";

type KpiCardConfig = {
  key: "totalNodes" | "activeServices" | "avgFidelity" | "totalQubits";
  label: string;
  unit: string;
  multiply?: number;
  icon: React.ElementType;
  iconClass: string;
};

const KPI_CARDS: readonly KpiCardConfig[] = [
  { key: "totalNodes",     label: "Total Nodes",    unit: "",  icon: Server, iconClass: "text-indigo-400" },
  { key: "activeServices", label: "Active Services",unit: "",  icon: Layers, iconClass: "text-cyan-400"   },
  { key: "avgFidelity",    label: "Avg Fidelity",   unit: "%", multiply: 100, icon: Gauge, iconClass: "text-violet-400" },
  { key: "totalQubits",    label: "Total Qubits",   unit: "",  icon: Cpu,    iconClass: "text-emerald-400"},
] as const;

export function DashboardKpiCards() {
  const { data, isLoading } = useDashboardStats();

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {KPI_CARDS.map((card) => {
        const raw = data?.[card.key];
        const displayValue =
          raw != null
            ? card.multiply != null
              ? `${(Number(raw) * card.multiply).toFixed(1)}${card.unit}`
              : `${raw}${card.unit}`
            : "—";
        const Icon = card.icon;

        return (
          <div
            key={card.key}
            className="relative overflow-hidden rounded-2xl p-5 ring-1 ring-white/8 transition-all duration-200 hover:ring-white/15"
            style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white/6">
              <Icon className={`h-4 w-4 ${card.iconClass}`} />
            </div>
            {isLoading ? (
              <Skeleton className="h-9 w-20 bg-white/10" />
            ) : (
              <p className="text-3xl font-semibold tabular-nums text-white">{displayValue}</p>
            )}
            <p className="mt-1 text-sm text-white/40">{card.label}</p>
          </div>
        );
      })}
    </div>
  );
}
