"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SERVICE_LABELS } from "../services";
import type { PinningService } from "../types";

interface UnpinModalProps {
  cid: string;
  service: PinningService;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

export function UnpinModal({
  service,
  open,
  onOpenChange,
  onConfirm,
}: UnpinModalProps) {
  const [confirming, setConfirming] = useState(false);

  const displayName = SERVICE_LABELS[service];

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove from vault tracking?</DialogTitle>
          <DialogDescription>
            Content stays pinned at {displayName}. This only removes it from your
            vault tracking. For permanent deletion, use the provider dashboard.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={confirming}>
            {confirming ? "Removing..." : "Remove from tracking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
