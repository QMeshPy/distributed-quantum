"use client";

import { Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
      variant="outline"
      className="cursor-default border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
    >
      <Pin data-icon="inline-start" />
      {variant === "compact" ? "Pinned" : displayName}
    </Badge>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            Pinned on{" "}
            {pinMeta.pinnedAt.toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
          {pinMeta.size > 0 && (
            <p className="text-xs text-muted-foreground">
              Size: {(pinMeta.size / 1024).toFixed(1)} KB
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
