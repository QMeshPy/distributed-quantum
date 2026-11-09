"use client";

import { Button } from "@/components/arc/button/button";

import dynamic from "next/dynamic";
import { Share2 } from "lucide-react";

interface ShareCircuitToVaultButtonProps {
  qasm: string;
  defaultName?: string;
  className?: string;
}

// Lazy-load so Helia / libp2p never evaluate during SSR (same pattern as ShareToVaultButton).
const ShareCircuitToVaultButtonInner = dynamic(
  () =>
    import("./share-circuit-to-vault-button-inner").then(
      (m) => m.ShareCircuitToVaultButtonInner,
    ),
  {
    ssr: false,
    loading: () => (
      <Button variant="secondary" size="sm"
        type="button"
        disabled
        className="w-full justify-center">
        <Share2 className="size-3.5 shrink-0 animate-pulse" />
        <span>Publish circuit to VAULT</span>
      </Button>
    ),
  },
);

export function ShareCircuitToVaultButton(props: ShareCircuitToVaultButtonProps) {
  return <ShareCircuitToVaultButtonInner {...props} />;
}
