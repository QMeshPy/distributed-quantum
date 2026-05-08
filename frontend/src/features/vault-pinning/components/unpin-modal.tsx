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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { PinningService } from "../types";

interface UnpinModalProps {
  cid: string;
  service: PinningService;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (hardDelete: boolean) => Promise<void>;
}

export function UnpinModal({
  service,
  open,
  onOpenChange,
  onConfirm,
}: UnpinModalProps) {
  const [choice, setChoice] = useState<"soft" | "hard">("soft");
  const [confirming, setConfirming] = useState(false);

  const displayName = service === "nft.storage" ? "NFT.Storage" : service;

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm(choice === "hard");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unpin from {displayName}?</DialogTitle>
          <DialogDescription>
            Choose how to handle the pinned content.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup
          value={choice}
          onValueChange={(v) => setChoice(v as "soft" | "hard")}
          className="flex flex-col gap-3 py-4"
        >
          <div className="flex items-start gap-3">
            <RadioGroupItem value="soft" id="soft" className="mt-0.5" />
            <Label htmlFor="soft" className="cursor-pointer">
              <span className="font-medium">Remove from tracking only</span>
              <span className="block text-xs text-muted-foreground">
                Content stays pinned, hidden from your vault
              </span>
            </Label>
          </div>
          <div className="flex items-start gap-3">
            <RadioGroupItem value="hard" id="hard" className="mt-0.5" />
            <Label htmlFor="hard" className="cursor-pointer">
              <span className="font-medium">
                Delete from {displayName} and free quota
              </span>
              <span className="block text-xs text-muted-foreground">
                Permanently removes content from pinning service
              </span>
            </Label>
          </div>
        </RadioGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={confirming}>
            {confirming ? "Confirming..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
