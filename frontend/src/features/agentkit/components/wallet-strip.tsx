"use client";

import { useWallet } from "../hooks/use-wallet";
import { useNotifications } from "../hooks/use-notifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Bell, Wallet } from "lucide-react";
import Link from "next/link";

function truncateAddress(address: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

type WalletStripProps = {
  onNotificationsClick: () => void;
};

export function WalletStrip({ onNotificationsClick }: WalletStripProps) {
  const { data: wallet, isLoading } = useWallet();
  const { data: notifications } = useNotifications();

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.025] px-4 py-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.025] px-4 py-2">
        <Wallet className="h-4 w-4 text-white/40" />
        <span className="text-sm text-white/60">No wallet connected</span>
        <Link href="/agents/wallet">
          <Button variant="ghost" size="sm" className="text-emerald-400">
            Create Wallet
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.025] px-4 py-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="font-mono text-sm text-white/80">
            {truncateAddress(wallet.address)}
          </span>
        </TooltipTrigger>
        <TooltipContent>{wallet.address}</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-4" />

      <span className="text-sm text-emerald-400">
        USDC: {wallet.usdc}
      </span>

      <span className="text-sm text-white/60">
        ETH: {wallet.eth}
      </span>

      <Badge variant="outline" className="text-xs text-white/60">
        {wallet.network}
      </Badge>

      <Separator orientation="vertical" className="h-4" />

      <Button
        variant="ghost"
        size="sm"
        className="relative"
        onClick={onNotificationsClick}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <Badge className="absolute -right-1 -top-1 h-4 w-4 rounded-full p-0 text-[10px] bg-amber-500">
            {unreadCount}
          </Badge>
        )}
      </Button>

      <Link href="/agents/wallet">
        <Button variant="ghost" size="sm" className="text-white/60 hover:text-white">
          Manage Wallet
        </Button>
      </Link>
    </div>
  );
}
