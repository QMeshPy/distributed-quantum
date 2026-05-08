"use client";

import { HardDrive } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/shared/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/shared/components/detail/data-table";
import { PinStatusBadge } from "@/features/vault-pinning/components/pin-status-badge";
import { useLocalVaultIndex } from "../hooks/use-local-vault-index";
import { QuotaDisplay } from "@/features/vault-pinning/components/quota-display";
import type { VaultItem } from "../types";

interface MyVaultClientProps {
  type: "circuit" | "run";
}

export function MyVaultClient({ type }: MyVaultClientProps) {
  const { items } = useLocalVaultIndex();
  const filtered = items.filter((i) => i.type === type);

  const title = type === "circuit" ? "My Circuits" : "My Runs";
  const emptyLabel = type === "circuit" ? "circuits" : "runs";

  const columns: DataTableColumn<VaultItem>[] = [
    {
      key: "name",
      header: "Name",
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: "addedAt",
      header: "Added",
      render: (row) => new Date(row.addedAt).toLocaleDateString(),
    },
    {
      key: "pinStatus",
      header: "Pin Status",
      render: (row) => <PinStatusBadge cid={row.cid} variant="compact" />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={HardDrive}
        label="Vault"
        title={title}
        description={`Manage your published ${emptyLabel}`}
        glow="orange"
      >
        <QuotaDisplay service="nft.storage" variant="header" />
      </PageHeader>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <HardDrive className="mb-3 size-10 text-muted-foreground/50" />
          <h3 className="text-sm font-medium">No {emptyLabel} yet</h3>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Publish {emptyLabel} from the lab to see them here.
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(row, i) => `${row.cid}-${i}`}
        />
      )}
    </div>
  );
}

export function MyVaultSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
