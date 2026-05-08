"use client";

import { Pin } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuota } from "../hooks/use-quota";
import type { PinningService } from "../types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

interface QuotaDisplayProps {
  service: PinningService;
  variant: "settings" | "header" | "tooltip";
}

export function QuotaDisplay({ service, variant }: QuotaDisplayProps) {
  const { data, isLoading } = useQuota(service);

  if (isLoading) {
    if (variant === "header") return <Skeleton className="h-5 w-24 rounded-full" />;
    return <Skeleton className="h-16 w-full rounded-lg" />;
  }

  if (!data) return null;

  const displayName = service === "nft.storage" ? "NFT.Storage" : service;
  const usedStr = formatBytes(data.used);

  if (variant === "header") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
        <Pin className="size-3" />
        {usedStr} / {data.total ? formatBytes(data.total) : "∞"}
      </span>
    );
  }

  if (variant === "tooltip") {
    return (
      <div className="space-y-1 text-xs">
        <p className="font-medium">{displayName} (free)</p>
        <p className="text-muted-foreground">
          {usedStr} used · {data.itemCount} items
        </p>
        <p className="text-muted-foreground">
          {data.total ? formatBytes(data.total) : "Unlimited quota"}
        </p>
      </div>
    );
  }

  const pct = data.total ? Math.round((data.used / data.total) * 100) : 0;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{displayName}</span>
      </div>
      {data.total && (
        <Progress value={pct} className="h-2" />
      )}
      <p className="text-xs text-muted-foreground">
        {usedStr} used · {data.itemCount} {data.itemCount === 1 ? "item" : "items"} pinned
      </p>
    </div>
  );
}
