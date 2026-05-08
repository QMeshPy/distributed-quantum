"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { useIpfsUpload } from "../hooks/use-ipfs-upload";
import { PinButton } from "@/features/vault-pinning/components/pin-button";

interface ShareToVaultButtonProps {
  data: Record<string, unknown>;
  name: string;
  type: "circuit" | "run";
}

export function ShareToVaultButton({ data, name, type }: ShareToVaultButtonProps) {
  const { upload, uploading, ready } = useIpfsUpload();
  const [sharedCid, setSharedCid] = useState<string | null>(null);

  const handleShare = async () => {
    const cid = await upload(data, name, type);
    if (cid) {
      setSharedCid(cid);
      toast.success("Shared to VAULT via IPFS");
    } else {
      toast.error("Failed to share to VAULT");
    }
  };

  if (sharedCid) {
    return (
      <PinButton
        cid={sharedCid}
        type={type}
        metadata={{ name, ...data }}
      />
    );
  }

  return (
    <Button
      variant="outline"
      onClick={handleShare}
      disabled={uploading || !ready}
    >
      {uploading ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <Share2 data-icon="inline-start" />
      )}
      {uploading ? "Sharing..." : "Share to VAULT"}
    </Button>
  );
}
