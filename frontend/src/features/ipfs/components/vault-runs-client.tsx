"use client";

import { Button } from "@/components/arc/button/button";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HardDrive } from "lucide-react";
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { PageHeader } from "@/shared/components/layout/page-header";
import { RunStatusBadge } from "@/features/runs/components/run-status-badge";
import { useLocalVaultIndex } from "../hooks/use-local-vault-index";
import { useIpfsFetch } from "../hooks/use-ipfs-fetch";
import { QuotaDisplay } from "@/features/vault-pinning/components/quota-display";
import { ROUTES } from "@/constants";
import type { VaultItem, RunIPFSRecord } from "../types";

function truncateCid(cid: string): string {
  if (cid.length <= 20) return cid;
  return `${cid.slice(0, 8)}…${cid.slice(-6)}`;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

interface EnrichedRun {
  item: VaultItem;
  record: RunIPFSRecord | null;
}

function useEnrichedRuns(runs: VaultItem[]) {
  const { fetchData, ready } = useIpfsFetch();
  const [enriched, setEnriched] = useState<EnrichedRun[]>([]);

  const cidKey = runs.map((r) => r.cid).join(",");

  useEffect(() => {
    setEnriched(runs.map((item) => ({ item, record: null })));
    if (!ready) return;

    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        runs.map(async (item) => {
          const record = await fetchData<RunIPFSRecord>(item.cid);
          return { item, record: record ?? null };
        }),
      );
      if (!cancelled) setEnriched(results);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cidKey]);

  return enriched;
}

export function VaultRunsClient() {
  const { items } = useLocalVaultIndex();
  const runs = items.filter((i) => i.type === "run");
  const enriched = useEnrichedRuns(runs);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={HardDrive}
        title="Shared Runs"
        description="Browse quantum workflow runs shared via IPFS"
      >
        <QuotaDisplay service="nft.storage" variant="header" />
      </PageHeader>

      {runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <HardDrive className="mb-3 size-10 text-subtle/50" />
          <h3 className="text-sm font-medium">No shared runs</h3>
          <p className="mt-1 max-w-sm text-xs text-subtle">
            Share a completed run to make it available here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <SortableDataTable
            caption="Shared runs"
            rowKey="cid"
            rows={enriched.map(({ item, record }) => ({ cid: item.cid, name: record?.name ?? item.name, status: record?.status ?? "", addedAt: item.addedAt }))}
            columns={[
              { key: "name", label: "Name", sortable: true, render: (v, row) => (
                <Button variant="ghost" size="sm" type="button"  onClick={() => router.push(ROUTES.vaultRunDetail(row.cid as string))}>{v as string}</Button>
              ) },
              { key: "status", label: "Status", sortable: true, render: (v) => v ? <RunStatusBadge status={v as Parameters<typeof RunStatusBadge>[0]["status"]} /> : <Skeleton lines={1} className="h-5 w-20" /> },
              { key: "cid", label: "CID", render: (v) => <span className="font-mono text-xs">{truncateCid(v as string)}</span> },
              { key: "addedAt", label: "Shared", sortable: true, render: (v) => formatRelative(v as Parameters<typeof formatRelative>[0]) },
            ]}
          />
        </div>
      )}
    </div>
  );
}

export function VaultRunsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton lines={4} className="h-24 w-full" />
      <Skeleton lines={6} className="h-64 w-full" />
    </div>
  );
}
