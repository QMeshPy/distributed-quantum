"use client";

import { HardDrive } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/shared/components/layout/page-header";
import { DataTable } from "@/shared/components/detail/data-table";
import { useLocalVaultIndex } from "../hooks/use-local-vault-index";
import { QuotaDisplay } from "@/features/vault-pinning/components/quota-display";
import type { VaultItem } from "../types";

const columns = [
  {
    key: "name",
    header: "Name",
    render: (row: VaultItem) => row.name,
  },
  {
    key: "addedAt",
    header: "Shared",
    render: (row: VaultItem) => new Date(row.addedAt).toLocaleDateString(),
  },
];

export function VaultRunsClient() {
  const { items } = useLocalVaultIndex();
  const runs = items.filter((i) => i.type === "run");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={HardDrive}
        label="Vault"
        title="Shared Runs"
        description="Browse quantum workflow runs shared via IPFS"
        glow="orange"
      >
        <QuotaDisplay service="nft.storage" variant="header" />
      </PageHeader>

      {runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <HardDrive className="mb-3 size-10 text-muted-foreground/50" />
          <h3 className="text-sm font-medium">No shared runs</h3>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Share a completed run to make it available here.
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={runs}
          getRowKey={(row, i) => `${row.cid}-${i}`}
        />
      )}
    </div>
  );
}

export function VaultRunsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
