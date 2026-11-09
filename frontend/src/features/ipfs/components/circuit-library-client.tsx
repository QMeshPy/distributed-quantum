"use client";

import { useState } from "react";
import { Search, HardDrive } from "lucide-react";
import { Input } from "@/components/arc/input/input";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { PageHeader } from "@/shared/components/layout/page-header";
import { useLocalVaultIndex } from "../hooks/use-local-vault-index";
import { QuotaDisplay } from "@/features/vault-pinning/components/quota-display";
import type { VaultItem } from "../types";

export function CircuitLibraryClient() {
  const { items } = useLocalVaultIndex();
  const [search, setSearch] = useState("");

  const circuits = items.filter((i) => i.type === "circuit");
  const filtered = circuits.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={HardDrive}
        title="Circuit Library"
        description="Browse and publish quantum circuits shared by the community"
      >
        <QuotaDisplay service="nft.storage" variant="header" />
      </PageHeader>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            label="Search circuits" placeholder="Search circuits..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {circuits.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((circuit) => (
            <CircuitCard key={circuit.cid} item={circuit} />
          ))}
        </div>
      )}
    </div>
  );
}

function CircuitCard({ item }: { item: VaultItem }) {
  return (
    <a
      href={`/vault/circuits/${item.cid}`}
      className="group rounded-lg border border-border bg-surface p-4 transition-colors hover:border-foreground/20"
    >
      <h3 className="truncate text-sm font-medium">{item.name}</h3>
      <p className="mt-1 text-xs text-subtle">
        Added {new Date(item.addedAt).toLocaleDateString()}
      </p>
      {item.size && (
        <p className="mt-0.5 text-xs text-subtle">
          {(item.size / 1024).toFixed(1)} KB
        </p>
      )}
    </a>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <HardDrive className="mb-3 size-10 text-subtle/50" />
      <h3 className="text-sm font-medium">No circuits yet</h3>
      <p className="mt-1 max-w-sm text-xs text-subtle">
        Publish a circuit from Lab → New Run (“Publish circuit to VAULT”), then
        open it here by CID.
      </p>
    </div>
  );
}

export function CircuitLibrarySkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton lines={4} className="h-24 w-full" />
      <Skeleton lines={2} className="h-10 w-full" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton lines={4} key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}
