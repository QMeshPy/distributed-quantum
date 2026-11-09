"use client";

import { useState } from "react";
import { Pin, Check } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/components/arc/button/button";
import { SplitButton } from "@/components/arc/split-button/split-button";
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
      toast.success(`Pinned to ${SERVICE_LABELS[service]}, share link copied`, {
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
      <Button size="sm" variant="secondary" loading disabled>
        Pinning...
      </Button>
    );
  }

  if (isPinned) {
    return (
      <>
        <Button size="sm" variant="secondary" onClick={() => setUnpinOpen(true)}>
          <Check size={12} />
          Pinned
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
    <SplitButton
      label={`Pin to ${SERVICE_LABELS[DEFAULT_SERVICE]}`}
      icon={<Pin size={12} />}
      onClick={() => handlePin(DEFAULT_SERVICE)}
      actions={ALTERNATIVE_SERVICES.map((service) => ({
        label: `Pin to ${SERVICE_LABELS[service]}`,
        onSelect: () => handlePin(service),
      }))}
    />
  );
}
