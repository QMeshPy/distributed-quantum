"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { Button } from "@/components/arc/button/button";
import { RadioGroup } from "@/components/arc/radio-group/radio-group";
import { SERVICE_LABELS } from "../services";
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

  const displayName = SERVICE_LABELS[service];

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
      <DialogContent title={`Unpin from ${displayName}?`} description="Choose how to handle the pinned content.">
        <RadioGroup
          label="Unpin behavior"
          value={choice}
          onValueChange={(v) => setChoice(v as "soft" | "hard")}
          options={[
            { value: "soft", label: "Remove from tracking only", description: "Content stays pinned, hidden from your vault" },
            { value: "hard", label: `Delete from ${displayName} and free quota`, description: "Permanently removes content from pinning service" },
          ]}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={confirming}>
            {confirming ? "Confirming..." : "Confirm"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
