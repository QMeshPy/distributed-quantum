"use client";

import { useState } from "react";
import { Pin, Check, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePin } from "../hooks/use-pin";
import { usePinMetadata } from "../hooks/use-pin-metadata";
import { UnpinModal } from "./unpin-modal";
import { DEFAULT_SERVICE, SERVICE_LABELS } from "../services";
import type { PinningService } from "../types";

interface PinButtonProps {
  cid: string;
  type: "circuit" | "run";
  metadata: Record<string, unknown>;
}

const ALTERNATIVE_SERVICES: PinningService[] = ["lighthouse"];

export function PinButton({ cid, type, metadata }: PinButtonProps) {
  const { pin, unpin, pinning } = usePin();
  const { data: pinMeta } = usePinMetadata(cid);
  const [unpinOpen, setUnpinOpen] = useState(false);

  const isPinned = !!pinMeta;

  const handlePin = async (service: PinningService = DEFAULT_SERVICE) => {
    try {
      const { gatewayCid } = await pin(cid, type, metadata, service);
      const sharePath = `/vault/cid/${gatewayCid}`;
      try {
        await navigator.clipboard.writeText(
          `${window.location.origin}${sharePath}`,
        );
      } catch {
        // Clipboard may be blocked; toast still shows the CID.
      }
      toast.success(`Pinned to ${SERVICE_LABELS[service]} — share link copied`, {
        description: gatewayCid,
        duration: 12_000,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pin failed");
    }
  };

  const handleUnpin = async (hardDelete: boolean) => {
    if (!pinMeta) return;
    try {
      await unpin(cid, pinMeta.service, hardDelete);
      toast.success(hardDelete ? "Unpinned and freed quota" : "Removed from tracking");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unpin failed");
    }
    setUnpinOpen(false);
  };

  if (pinning) {
    return (
      <button
        disabled
        className="inline-flex cursor-not-allowed items-center self-center gap-1.5 rounded-md border border-blue-500/25 bg-blue-500/8 px-3 py-1.5 text-[12px] font-medium text-blue-400 opacity-60"
      >
        <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
        <span>Pinning...</span>
      </button>
    );
  }

  if (isPinned) {
    return (
      <>
        <button
          onClick={() => setUnpinOpen(true)}
          className={cn(
            "group relative inline-flex cursor-pointer items-center self-center gap-1.5 overflow-hidden rounded-md",
            "border border-emerald-500/25 bg-emerald-500/8 px-3 py-1.5",
            "text-[12px] font-medium text-emerald-400 transition-all duration-200",
            "hover:border-emerald-500/50 hover:bg-emerald-500/15 hover:text-emerald-300",
          )}
        >
          <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-emerald-400/12 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          <Check className="h-3 w-3 shrink-0" />
          <span>Pinned</span>
        </button>
        <UnpinModal
          cid={cid}
          service={pinMeta.service}
          open={unpinOpen}
          onOpenChange={setUnpinOpen}
          onConfirm={handleUnpin}
        />
      </>
    );
  }

  return (
    <div className="inline-flex items-center self-center">
      <button
        onClick={() => handlePin(DEFAULT_SERVICE)}
        className={cn(
          "group relative inline-flex cursor-pointer items-center gap-1.5 overflow-hidden",
          "rounded-l-md border border-r-0 border-violet-500/25 bg-violet-500/8 px-3 py-1.5",
          "text-[12px] font-medium text-violet-400 transition-all duration-200",
          "hover:border-violet-500/50 hover:bg-violet-500/15 hover:text-violet-300",
        )}
      >
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-violet-400/12 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
        <Pin className="h-3 w-3 shrink-0 animate-pulse" />
        <span>Pin to {SERVICE_LABELS[DEFAULT_SERVICE]}</span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "group relative inline-flex cursor-pointer items-center overflow-hidden",
              "rounded-r-md border border-violet-500/25 bg-violet-500/8 px-1.5 py-1.5",
              "text-[12px] font-medium text-violet-400 transition-all duration-200",
              "hover:border-violet-500/50 hover:bg-violet-500/15 hover:text-violet-300",
            )}
          >
            <ChevronDown className="h-3 w-3 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[140px]">
          {ALTERNATIVE_SERVICES.map((service) => (
            <DropdownMenuItem key={service} onClick={() => handlePin(service)}>
              Pin to {SERVICE_LABELS[service]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
