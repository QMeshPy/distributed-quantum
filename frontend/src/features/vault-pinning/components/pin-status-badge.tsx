"use client";

import { Pin } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { Tooltip } from "@/components/arc/tooltip/tooltip";
import { usePinMetadata } from "../hooks/use-pin-metadata";
import { SERVICE_LABELS } from "../services";

interface PinStatusBadgeProps {
  cid: string;
  variant?: "default" | "compact";
}

export function PinStatusBadge({ cid, variant = "default" }: PinStatusBadgeProps) {
  const { data: pinMeta } = usePinMetadata(cid);

  if (!pinMeta) return null;

  const displayName = SERVICE_LABELS[pinMeta.service];

  const badge = (
    <Badge
      outline
      className="cursor-default border-success/30 bg-success/10 text-success"
    >
      <Pin data-icon="inline-start" />
      {variant === "compact" ? "Pinned" : displayName}
    </Badge>
  );

  return (
    <Tooltip
      content={
        <>
          <p className="text-xs">
            Pinned on{" "}
            {pinMeta.pinnedAt.toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
          {pinMeta.size > 0 && (
            <p className="text-xs text-subtle">
              Size: {(pinMeta.size / 1024).toFixed(1)} KB
            </p>
          )}
        </>
      }
    >
      {badge}
    </Tooltip>
  );
}
