"use client";

import { CopyButton } from "@/components/arc/copy-button/copy-button";
import { toast } from "@/shared/lib/toast";
import { shortAddress } from "@/features/agentkit/hooks/use-agents";

export function WalletAddressCopy({ address, className = "" }: { address: string; className?: string }) {
  if (!address) return <span className={className}>-</span>;
  return (
    <span className={className} onClick={(event) => event.stopPropagation()}>
      <CopyButton
        value={address}
        label={shortAddress(address)}
        onCopied={() => toast.success("Wallet address copied")}
      />
    </span>
  );
}
