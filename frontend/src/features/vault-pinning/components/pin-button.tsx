"use client";

import { useState } from "react";
import { Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { usePin } from "../hooks/use-pin";
import { usePinMetadata } from "../hooks/use-pin-metadata";
import type { PinningService } from "../types";
import { UnpinModal } from "./unpin-modal";

interface PinButtonProps {
  cid: string;
  type: "circuit" | "run";
  metadata: Record<string, unknown>;
  variant?: "default" | "compact";
}

export function PinButton({ cid, type, metadata, variant = "default" }: PinButtonProps) {
  const { pin, unpin, pinning } = usePin();
  const { data: pinMeta } = usePinMetadata(cid);
  const [unpinOpen, setUnpinOpen] = useState(false);

  const isPinned = !!pinMeta;

  const handlePin = async (service: PinningService) => {
    try {
      await pin(cid, type, metadata, service);
      toast.success(`Pinned to ${service === "nft.storage" ? "NFT.Storage" : service}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pin failed");
    }
  };

  const handleUnpin = async (hardDelete: boolean) => {
    if (!pinMeta) return;
    try {
      await unpin(cid, pinMeta.service, hardDelete);
      toast.success(
        hardDelete ? "Unpinned and freed quota" : "Removed from tracking",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unpin failed");
    }
    setUnpinOpen(false);
  };

  if (pinning) {
    return (
      <Button
        variant="outline"
        size={variant === "compact" ? "sm" : "default"}
        disabled
        className="border-blue-500/30 bg-blue-500/10 text-blue-400"
      >
        <Spinner data-icon="inline-start" />
        Pinning...
      </Button>
    );
  }

  if (isPinned) {
    return (
      <>
        <Button
          variant="outline"
          size={variant === "compact" ? "sm" : "default"}
          onClick={() => setUnpinOpen(true)}
          className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
        >
          <Pin data-icon="inline-start" />
          Pinned to NFT.Storage
        </Button>
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={variant === "compact" ? "sm" : "default"}>
          <Pin data-icon="inline-start" />
          Pin
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handlePin("nft.storage")}>
          NFT.Storage (free)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
