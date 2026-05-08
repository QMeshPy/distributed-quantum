"use client";
import { Skeleton } from "@/components/ui/skeleton";
import { useNetworkServices } from "../hooks/use-network-fidelity";
import type { ServiceNode } from "../types";

export function ServiceTable() {
  const { data, isLoading } = useNetworkServices();
  const services = (data as ServiceNode[] | undefined) ?? [];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl bg-white/5" />
        ))}
      </div>
    );
  }

  if (!services.length) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-2xl py-16 ring-1 ring-white/8"
        style={{ background: "rgba(255,255,255,0.04)" }}
      >
        <p className="text-sm text-white/30">No services registered.</p>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-2xl ring-1 ring-white/8"
      style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
    >
      <div className="grid grid-cols-5 gap-4 border-b border-white/6 px-4 py-2.5">
        {["Node ID", "Service Type", "Fidelity", "Qubits", "Status"].map((h) => (
          <p key={h} className="text-[10px] font-semibold uppercase tracking-widest text-white/25">{h}</p>
        ))}
      </div>
      {services.map((svc, i) => (
        <div
          key={`${svc.nodeId}-${svc.serviceType}`}
          className={`grid grid-cols-5 gap-4 items-center px-4 py-3 hover:bg-white/3 transition-colors ${i > 0 ? "border-t border-white/5" : ""}`}
        >
          <span className="font-mono text-xs text-white/50">{(svc.nodeId ?? "").slice(0, 18)}…</span>
          <span className="text-sm text-white/70">{svc.serviceType}</span>
          <span className="tabular-nums text-sm font-medium text-indigo-400">
            {(svc.fidelity * 100).toFixed(1)}%
          </span>
          <span className="text-sm text-white/40">{svc.qubitMin}–{svc.qubitMax}</span>
          <div>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${svc.availability ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${svc.availability ? "bg-emerald-400" : "bg-red-400"}`} />
              {svc.availability ? "available" : "offline"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
