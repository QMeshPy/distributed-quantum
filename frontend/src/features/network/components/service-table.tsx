"use client";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { useNetworkServices } from "../hooks/use-network-fidelity";
import type { ServiceNode } from "../types";

export function ServiceTable() {
  const { data, isLoading } = useNetworkServices();
  const services = (data as ServiceNode[] | undefined) ?? [];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton lines={2} key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!services.length) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-2xl py-16 ring-1 ring-border"
        style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
      >
        <p className="text-sm text-faint">No services registered.</p>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-2xl ring-1 ring-border"
      style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
    >
      <div className="grid grid-cols-5 gap-4 border-b border-border px-4 py-2.5">
        {["Node ID", "Service Type", "Fidelity", "Qubits", "Status"].map((h) => (
          <p key={h} className="text-xs font-medium text-faint">{h}</p>
        ))}
      </div>
      {services.map((svc, i) => (
        <div
          key={`${svc.nodeId}-${svc.serviceType}`}
          className={`grid grid-cols-5 gap-4 items-center px-4 py-3 hover:bg-surface-muted transition-colors ${i > 0 ?"border-t border-border" : ""}`}
        >
          <span className="font-mono text-xs text-subtle">{(svc.nodeId ?? "").slice(0, 18)}…</span>
          <span className="text-sm text-foreground">{svc.serviceType}</span>
          <span className="tabular-nums text-sm font-medium text-accent">
            {(svc.fidelity * 100).toFixed(1)}%
          </span>
          <span className="text-sm text-subtle">{svc.qubitMin}–{svc.qubitMax}</span>
          <div>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${svc.availability ?"bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${svc.availability ?"bg-success" : "bg-danger"}`} />
              {svc.availability ? "available" : "offline"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
