"use client";

import dynamic from "next/dynamic";
import { Share2, XCircle } from "lucide-react";

interface ShareToVaultButtonProps {
  data: Record<string, unknown>;
  name: string;
  type: "circuit" | "run";
}

// Lazy-load the inner component so helia/libp2p/node-datachannel are never
// evaluated during SSR, even when this button is imported in non-vault pages.
const ShareToVaultButtonInner = dynamic(
  () => import("./share-to-vault-button-inner").then((m) => m.ShareToVaultButtonInner),
  {
    ssr: false,
    loading: () => (
      <button className="inline-flex cursor-pointer items-center self-center gap-1.5 rounded-md border border-rose-500/25 bg-rose-500/8 px-3 py-1.5 text-[12px] font-medium text-rose-400">
        <Share2 className="h-3 w-3 shrink-0 animate-pulse" />
        <span>Share to VAULT</span>
        <XCircle className="h-3 w-3 shrink-0" />
      </button>
    ),
  },
);

export function ShareToVaultButton(props: ShareToVaultButtonProps) {
  return <ShareToVaultButtonInner {...props} />;
}
