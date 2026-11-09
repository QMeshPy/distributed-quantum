"use client";

import { useState, useEffect } from "react";
import { Share2, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIpfsUpload } from "../hooks/use-ipfs-upload";
import { getLocalItems } from "../lib/local-index";
import { PinButton } from "@/features/vault-pinning/components/pin-button";

interface ShareToVaultButtonProps {
  data: Record<string, unknown>;
  name: string;
  type: "circuit" | "run";
}

export function ShareToVaultButtonInner({ data, name, type }: ShareToVaultButtonProps) {
  const { upload, uploading, ready, heliaStatus } = useIpfsUpload();

  // Restore CID from the local vault index so the button stays in "pinning"
  // state when navigating away and back to the page.
  const [sharedCid, setSharedCid] = useState<string | null>(() => {
    const existing = getLocalItems().find((i) => i.name === name && i.type === type);
    return existing?.cid ?? null;
  });

  // Keep in sync if another tab/upload adds the item while this component is mounted.
  useEffect(() => {
    if (sharedCid) return;
    const existing = getLocalItems().find((i) => i.name === name && i.type === type);
    if (existing) setSharedCid(existing.cid);
  }, [name, type, sharedCid]);

  const handleShare = async () => {
    if (!ready) {
      toast.warning(heliaStatus);
      return;
    }
    const cid = await upload(data, name, type);
    if (cid) {
      setSharedCid(cid);
      toast.success("Shared to VAULT via IPFS");
    } else {
      toast.error("Failed to share to VAULT");
    }
  };

  if (sharedCid) {
    return <PinButton cid={sharedCid} type={type} metadata={{ name, ...data }} />;
  }

  const isNotReady = !ready && !uploading;

  const btn = (
    <button
      onClick={handleShare}
      disabled={uploading}
      className={cn(
        "group relative inline-flex cursor-pointer items-center self-center gap-1.5 overflow-hidden rounded-md",
        "border px-3 py-1.5",
        "text-[12px] font-medium transition-all duration-200",
        isNotReady
          ? "border-rose-500/25 bg-rose-500/8 text-rose-400 hover:border-rose-500/50 hover:bg-rose-500/15 hover:text-rose-300"
          : "border-cyan-500/25 bg-cyan-500/8 text-cyan-400 hover:border-cyan-500/50 hover:bg-cyan-500/15 hover:text-cyan-300",
        uploading && "cursor-not-allowed opacity-60",
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent to-transparent transition-transform duration-700 group-hover:translate-x-full",
          isNotReady ? "via-rose-400/12" : "via-cyan-400/12",
        )}
      />
      {uploading ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
      ) : (
        <Share2 className="h-3 w-3 shrink-0 animate-pulse" />
      )}
      <span>{uploading ? "Sharing..." : "Share to VAULT"}</span>
      {isNotReady && <XCircle className="h-3 w-3 shrink-0" />}
    </button>
  );

  if (isNotReady) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="top" className="max-w-56 text-center text-xs">
            {heliaStatus}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return btn;
}
