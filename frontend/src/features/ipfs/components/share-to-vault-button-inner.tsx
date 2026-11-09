"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/arc/button/button";
import { Share2, XCircle } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { Tooltip } from "@/components/arc/tooltip/tooltip";
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
    <Button
      size="sm"
      variant={isNotReady ? "danger" : "secondary"}
      onClick={handleShare}
      disabled={uploading}
      loading={uploading}
    >
      {uploading ? null : <Share2 className="h-3 w-3 shrink-0" />}
      <span>{uploading ? "Sharing..." : "Share to VAULT"}</span>
      {isNotReady && <XCircle className="h-3 w-3 shrink-0" />}
    </Button>
  );

  if (isNotReady) {
    return (
      <Tooltip side="top" content={heliaStatus}>
        {btn}
      </Tooltip>
    );
  }

  return btn;
}
