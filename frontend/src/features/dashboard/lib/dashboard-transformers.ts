import type { DashboardNetworkStats, DashboardHealthSummary } from "../types";

export function formatFidelity(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function getHealthStatus(fidelity: number): "healthy" | "degraded" | "critical" {
  if (fidelity >= 0.9) return "healthy";
  if (fidelity >= 0.7) return "degraded";
  return "critical";
}

export function formatNodeCount(active: number, total: number): string {
  return `${active}/${total}`;
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.floor(seconds))}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) {
    return `${Math.floor(seconds / 3_600)}h ${Math.floor((seconds % 3_600) / 60)}m`;
  }
  return `${Math.floor(seconds / 86_400)}d ${Math.floor((seconds % 86_400) / 3_600)}h`;
}

export function formatRelativeTime(isoValue: string | null, referenceDate: Date): string {
  if (!isoValue) return "Unavailable";

  const targetDate = new Date(isoValue);
  if (Number.isNaN(targetDate.getTime())) return "Unavailable";

  const diffMs = referenceDate.getTime() - targetDate.getTime();
  const absDiffMs = Math.abs(diffMs);
  const suffix = diffMs >= 0 ? "ago" : "from now";

  if (absDiffMs < 60_000) return "just now";
  if (absDiffMs < 3_600_000) return `${Math.round(absDiffMs / 60_000)}m ${suffix}`;
  if (absDiffMs < 86_400_000) return `${Math.round(absDiffMs / 3_600_000)}h ${suffix}`;
  return `${Math.round(absDiffMs / 86_400_000)}d ${suffix}`;
}

export function formatNodeLabel(nodeId: string): string {
  if (nodeId.length <= 18) return nodeId;
  return `${nodeId.slice(0, 8)}...${nodeId.slice(-6)}`;
}

export function deriveHealthFromStats(stats: DashboardNetworkStats): "healthy" | "degraded" | "critical" {
  return getHealthStatus(stats.averageFidelity);
}

export function deriveCoordinatorStatus(health: DashboardHealthSummary | null): "ok" | "down" {
  if (!health) return "down";
  return health.status === "ok" ? "ok" : "down";
}
