"use client";

import { useWallet } from "../hooks/use-wallet";
import { useNotifications } from "../hooks/use-notifications";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { Bell, Wallet } from "lucide-react";
import Link from "next/link";
import { EnsAddress } from "./ens-address";

type WalletStripProps = {
  onNotificationsClick: () => void;
};

export function WalletStrip({ onNotificationsClick }: WalletStripProps) {
  const { data: wallet, isLoading } = useWallet();
  const { data: notifications } = useNotifications();

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-4 py-2">
        <Skeleton lines={1} className="h-4 w-24" />
        <Skeleton lines={1} className="h-4 w-16" />
        <Skeleton lines={1} className="h-4 w-16" />
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-4 py-2">
        <Wallet className="h-4 w-4 text-subtle" />
        <span className="text-sm text-subtle">No wallet connected</span>
        <Link href="/agents/wallet">
          <Button variant="ghost" size="sm" className="text-success">
            Create Wallet
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-4 py-2">
      <EnsAddress address={wallet.address} className="text-sm text-foreground" />

      <span aria-hidden="true" className="h-4 w-px bg-border" />

      <span className="text-sm text-success">
        USDC: {wallet.usdc}
      </span>

      <span className="text-sm text-subtle">
        ETH: {wallet.eth}
      </span>

      <Badge outline className="text-xs text-subtle">
        {wallet.network}
      </Badge>

      <span aria-hidden="true" className="h-4 w-px bg-border" />

      <Button
        variant="ghost"
        size="sm"
        className="relative"
        onClick={onNotificationsClick}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <Badge className="absolute -right-1 -top-1 h-4 w-4 rounded-full p-0 text-xs bg-warning">
            {unreadCount}
          </Badge>
        )}
      </Button>

      <Link href="/agents/wallet">
        <Button variant="ghost" size="sm" className="text-subtle hover:text-foreground">
          Manage Wallet
        </Button>
      </Link>
    </div>
  );
}
