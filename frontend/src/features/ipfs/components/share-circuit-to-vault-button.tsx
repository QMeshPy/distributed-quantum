"use client";

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
      <button
        type="button"
        disabled
        className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-cyan-500/25 bg-cyan-500/8 px-3 py-2.5 text-[13px] font-semibold text-cyan-300/70"
      >
        <Share2 className="size-3.5 shrink-0 animate-pulse" />
        <span>Publish circuit to VAULT</span>
      </button>
    ),
  },
);

export function ShareCircuitToVaultButton(props: ShareCircuitToVaultButtonProps) {
  return <ShareCircuitToVaultButtonInner {...props} />;
}
