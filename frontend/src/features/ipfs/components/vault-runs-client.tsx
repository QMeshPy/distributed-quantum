"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HardDrive, Calendar, Hash } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
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
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/6 hover:bg-transparent">
                <TableHead className="text-[11px] font-medium text-white/35">
                  <span className="flex items-center gap-1.5">
                    <HardDrive size={11} />
                    Name
                  </span>
                </TableHead>
                <TableHead className="text-[11px] font-medium text-white/35">Status</TableHead>
                <TableHead className="text-[11px] font-medium text-white/35">
                  <span className="flex items-center gap-1.5">
                    <Hash size={11} />
                    CID
                  </span>
                </TableHead>
                <TableHead className="text-right text-[11px] font-medium text-white/35">
                  <span className="flex items-center justify-end gap-1.5">
                    <Calendar size={11} />
                    Shared
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enriched.map(({ item, record }) => (
                <TableRow
                  key={item.cid}
                  className="cursor-pointer border-white/4 transition-colors hover:bg-orange-500/5 last:border-0"
                  onClick={() => router.push(ROUTES.vaultRunDetail(item.cid))}
                >
                  <TableCell className="font-medium text-white/80">
                    {record?.name ?? item.name}
                  </TableCell>
                  <TableCell>
                    {record?.status ? (
                      <RunStatusBadge status={record.status} />
                    ) : (
                      <Skeleton className="h-5 w-20" />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-white/40">
                    {truncateCid(item.cid)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-white/35">
                    {formatRelative(item.addedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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
