"use client";

import React from "react";
import { Server, Layers, Gauge, Cpu } from "lucide-react";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
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
  { key: "totalNodes",     label: "Total Nodes",    unit: "",  icon: Server, iconClass: "text-accent" },
  { key: "activeServices", label: "Active Services",unit: "",  icon: Layers, iconClass: "text-info"   },
  { key: "avgFidelity",    label: "Avg Fidelity",   unit: "%", multiply: 100, icon: Gauge, iconClass: "text-accent" },
  { key: "totalQubits",    label: "Total Qubits",   unit: "",  icon: Cpu,    iconClass: "text-success"},
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
            : "-";
        const Icon = card.icon;

        return (
          <div
            key={card.key}
            className="relative overflow-hidden rounded-2xl p-5 ring-1 ring-border transition-all duration-200 hover:ring-border-strong"
            style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-surface-muted">
              <Icon className={`h-4 w-4 ${card.iconClass}`} />
            </div>
            {isLoading ? (
              <Skeleton lines={2} className="h-9 w-20" />
            ) : (
              <p className="text-3xl font-medium tabular-nums text-foreground">{displayValue}</p>
            )}
            <p className="mt-1 text-sm text-subtle">{card.label}</p>
          </div>
        );
      })}
    </div>
  );
}
