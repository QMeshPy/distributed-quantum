"use client";

import { Button } from "@/components/arc/button/button";

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
      <Button variant="danger" size="sm" className="self-center">
        <Share2 className="h-3 w-3 shrink-0 animate-pulse" />
        <span>Share to VAULT</span>
        <XCircle className="h-3 w-3 shrink-0" />
      </Button>
    ),
  },
);

export function ShareToVaultButton(props: ShareToVaultButtonProps) {
  return <ShareToVaultButtonInner {...props} />;
}
