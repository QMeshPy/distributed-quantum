"use client";

import { HardDrive } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/shared/components/layout/page-header";
import { GlassCard } from "@/shared/components/detail/glass-card";
import { PinButton } from "@/features/vault-pinning/components/pin-button";
import { PinStatusBadge } from "@/features/vault-pinning/components/pin-status-badge";
import { useIpfsFetch } from "../hooks/use-ipfs-fetch";
import { useEffect, useState } from "react";
import type { CircuitIPFSRecord } from "../types";

interface CircuitDetailClientProps {
  cid: string;
}

export function CircuitDetailClient({ cid }: CircuitDetailClientProps) {
  const { fetchData, ready } = useIpfsFetch();
  const [circuit, setCircuit] = useState<CircuitIPFSRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const data = await fetchData<CircuitIPFSRecord>(cid);
      setCircuit(data);
      setLoading(false);
    })();
  }, [cid, ready, fetchData]);

  if (loading || !ready) return <CircuitDetailSkeleton />;
  if (!circuit) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <h3 className="text-sm font-medium">Circuit not found</h3>
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
        title={circuit.name}
        description={circuit.description || "No description"}
        glow="orange"
      >
        <PinStatusBadge cid={cid} />
        <PinButton
          cid={cid}
          type="circuit"
          metadata={{
            name: circuit.name,
            qubit_count: circuit.qubitCount,
            gate_count: circuit.gateCount,
          }}
        />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <GlassCard>
          <p className="text-xs text-muted-foreground">Qubits</p>
          <p className="text-lg font-medium">{circuit.qubitCount}</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs text-muted-foreground">Gates</p>
          <p className="text-lg font-medium">{circuit.gateCount}</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs text-muted-foreground">Author</p>
          <p className="text-lg font-medium">{circuit.author}</p>
        </GlassCard>
      </div>

      {circuit.qasm && (
        <GlassCard>
          <p className="mb-2 text-xs font-medium text-muted-foreground">QASM</p>
          <pre className="overflow-auto rounded bg-muted/50 p-3 text-xs">
            {circuit.qasm}
          </pre>
        </GlassCard>
      )}

      {circuit.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {circuit.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CircuitDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
