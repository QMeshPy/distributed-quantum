"use client";

import Link from "next/link";
import { HardDrive } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/shared/components/layout/page-header";
import { GlassCard } from "@/shared/components/detail/glass-card";
import { PinButton } from "@/features/vault-pinning/components/pin-button";
import { PinStatusBadge } from "@/features/vault-pinning/components/pin-status-badge";
import { ROUTES } from "@/constants";
import { useHeliaContext } from "../provider";
import { resolveRunCircuit } from "../lib/run-circuit-link";
import { useEffect, useState } from "react";
import type { CircuitIPFSRecord, RunIPFSRecord } from "../types";

interface VaultRunDetailClientProps {
  cid: string;
}

export function VaultRunDetailClient({ cid }: VaultRunDetailClientProps) {
  const { helia, ready } = useHeliaContext();
  const [run, setRun] = useState<RunIPFSRecord | null>(null);
  const [circuit, setCircuit] = useState<CircuitIPFSRecord | null>(null);
  const [circuitCid, setCircuitCid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !helia) return;
    (async () => {
      try {
        const resolved = await resolveRunCircuit(helia, cid);
        setRun(resolved.run);
        setCircuit(resolved.circuit);
        setCircuitCid(resolved.circuitCid);
      } catch {
        // Fall back: run without resolvable circuit (legacy / missing block)
        try {
          const { getVaultJson } = await import("../lib/run-circuit-link");
          const { materializeRunRecord } = await import("../lib/run-record");
          const { CID } = await import("multiformats/cid");
          const raw = await getVaultJson(helia, CID.parse(cid));
          const materialized = materializeRunRecord(raw);
          setRun(materialized);
          setCircuitCid(materialized.circuitCid || null);
        } catch {
          setRun(null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [cid, ready, helia]);

  if (loading || !ready) return <RunDetailSkeleton />;
  if (!run) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <h3 className="text-sm font-medium">Run not found</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          CID: {cid.slice(0, 16)}...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={HardDrive}
        label="Vault"
        title={run.name}
        description={`Shared by ${run.author}`}
        glow="orange"
      >
        <PinStatusBadge cid={cid} />
        <PinButton
          cid={cid}
          type="run"
          metadata={{
            name: run.name,
            qubit_count: run.qubitCount,
            peer_count: run.peerCount,
          }}
        />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <GlassCard>
          <p className="text-xs text-muted-foreground">Qubits</p>
          <p className="text-lg font-medium">{run.qubitCount}</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs text-muted-foreground">Peers</p>
          <p className="text-lg font-medium">{run.peerCount}</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs text-muted-foreground">Runtime</p>
          <p className="text-lg font-medium">{run.runtime}ms</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="text-lg font-medium capitalize">{run.status}</p>
        </GlassCard>
      </div>

      {circuitCid ? (
        <GlassCard>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Circuit (IPLD link)
          </p>
          {circuit ? (
            <p className="text-sm font-medium">{circuit.name}</p>
          ) : null}
          <Link
            href={ROUTES.vaultCircuitDetail(circuitCid)}
            className="mt-1 break-all font-mono text-xs text-cyan-400 hover:underline"
          >
            {circuitCid}
          </Link>
        </GlassCard>
      ) : null}

      {run.results && (
        <GlassCard>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Results</p>
          <pre className="overflow-auto rounded bg-muted/50 p-3 text-xs">
            {JSON.stringify(run.results, null, 2)}
          </pre>
        </GlassCard>
      )}
    </div>
  );
}

function RunDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-4 gap-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
