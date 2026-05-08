"use client";

import { HardDrive } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/shared/components/layout/page-header";
import { GlassCard } from "@/shared/components/detail/glass-card";
import { PinButton } from "@/features/vault-pinning/components/pin-button";
import { PinStatusBadge } from "@/features/vault-pinning/components/pin-status-badge";
import { useIpfsFetch } from "../hooks/use-ipfs-fetch";
import { useEffect, useState } from "react";
import type { RunIPFSRecord } from "../types";

interface VaultRunDetailClientProps {
  cid: string;
}

export function VaultRunDetailClient({ cid }: VaultRunDetailClientProps) {
  const { fetchData, ready } = useIpfsFetch();
  const [run, setRun] = useState<RunIPFSRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const data = await fetchData<RunIPFSRecord>(cid);
      setRun(data);
      setLoading(false);
    })();
  }, [cid, ready, fetchData]);

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
