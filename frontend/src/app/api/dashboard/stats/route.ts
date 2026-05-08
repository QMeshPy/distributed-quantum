import { BACKEND } from "@/constants";
import { NextResponse } from "next/server";

type BackendPeer = { is_stale?: boolean };
type BackendService = { availability?: boolean; fidelity?: number; qubit_max?: number };
type BackendHealth = { status?: string; service?: string; version?: string; environment?: string; uptime_seconds?: number };

export async function GET() {
  try {
    const [peersRes, servicesRes, healthRes] = await Promise.all([
      fetch(BACKEND.DISCOVERY.PEERS),
      fetch(BACKEND.SERVICES.LIST),
      fetch(BACKEND.HEALTH),
    ]);

    const peersData = peersRes.ok ? await peersRes.json() as { peers?: BackendPeer[] } : null;
    const services: BackendService[] = servicesRes.ok ? await servicesRes.json() : [];
    const health: BackendHealth | null = healthRes.ok ? await healthRes.json() : null;

    const peers: BackendPeer[] = peersData?.peers ?? [];
    const activePeers = peers.filter((p) => !p.is_stale).length;
    const activeServices = services.filter((s) => s.availability).length;
    const fidelities = services.map((s) => s.fidelity ?? 0).filter((f) => f > 0);
    const avgFidelity = fidelities.length > 0 ? fidelities.reduce((a, b) => a + b, 0) / fidelities.length : 0;
    const totalQubits = services.reduce((sum, s) => sum + (s.qubit_max ?? 0), 0);

    return NextResponse.json({
      totalNodes: peers.length,
      activeServices,
      avgFidelity,
      totalQubits,
      networkStats: {
        totalPeers: peers.length,
        activePeers,
        totalServices: services.length,
        averageFidelity: avgFidelity,
      },
      health: health
        ? {
            status: health.status ?? "unknown",
            service: health.service ?? "",
            version: health.version ?? "",
            environment: health.environment ?? "",
            uptimeSeconds: health.uptime_seconds ?? 0,
          }
        : null,
      warnings: [],
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch dashboard stats" }, { status: 502 });
  }
}
