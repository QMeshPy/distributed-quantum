"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wallet, Plus, Trash2, Check, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  linkEthereumWallet,
  unlinkEthereumWallet,
  fetchLinkedWallets,
  type LinkedWalletItem,
} from "@/features/auth/lib/siwe";

function truncateAddress(addr: string): string {
  if (!addr) return "";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function getNetworkLabel(chainId: number): string {
  switch (chainId) {
    case 1:
      return "Ethereum Mainnet";
    case 11155111:
      return "Sepolia Testnet";
    case 8453:
      return "Base";
    case 84532:
      return "Base Sepolia";
    case 42161:
      return "Arbitrum One";
    case 10:
      return "Optimism";
    default:
      return `Chain ${chainId}`;
  }
}

export function LinkedWalletsPanel() {
  const [wallets, setWallets] = useState<LinkedWalletItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [unlinkingAddress, setUnlinkingAddress] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const loadWallets = async () => {
    try {
      const items = await fetchLinkedWallets();
      setWallets(items);
    } catch {
      toast.error("Failed to load linked wallets.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWallets();
  }, []);

  const handleLink = async () => {
    setLinking(true);
    try {
      const res = await linkEthereumWallet();
      if (!res.success) {
        toast.error(res.error || "Failed to link Ethereum wallet.");
        return;
      }

      if (res.alreadyLinked) {
        toast.info("This wallet is already linked to your account.");
      } else {
        toast.success(
          `Wallet ${truncateAddress(res.address || "")} successfully linked!`,
        );
      }
      await loadWallets();
    } catch (err: any) {
      toast.error(err?.message || "Failed to link wallet.");
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (address: string) => {
    setUnlinkingAddress(address);
    try {
      const res = await unlinkEthereumWallet(address);
      if (!res.success) {
        toast.error(res.error || "Failed to unlink wallet.");
        return;
      }
      toast.success("Wallet successfully unlinked.");
      await loadWallets();
    } catch (err: any) {
      toast.error(err?.message || "Failed to unlink wallet.");
    } finally {
      setUnlinkingAddress(null);
    }
  };

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
    toast.success("Address copied to clipboard");
  };

  return (
    <Card className="border-hairline">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            Linked Wallets (SIWE)
          </CardTitle>
          <CardDescription className="mt-1">
            Sign in and verify actions with your Ethereum address (EIP-4361).
          </CardDescription>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleLink}
          disabled={linking || loading}
          className="gap-1.5"
        >
          {linking ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {linking ? "Connecting…" : "Link Wallet"}
        </Button>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Spinner className="mr-2" /> Loading linked wallets…
          </div>
        ) : wallets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-hairline p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No Ethereum wallets linked yet. Link a wallet to sign in with your address.
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-hairline">
            {wallets.map((wallet) => (
              <div
                key={wallet.address}
                className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-foreground">
                      {truncateAddress(wallet.address)}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyAddress(wallet.address)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="Copy full address"
                    >
                      {copiedAddress === wallet.address ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                    {wallet.ensName && (
                      <Badge variant="secondary" className="text-xs">
                        {wallet.ensName}
                      </Badge>
                    )}
                    {wallet.isPrimary && (
                      <Badge variant="outline" className="text-xs text-primary border-primary/30">
                        Primary
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{getNetworkLabel(wallet.chainId)}</span>
                    <span>•</span>
                    <span>
                      Linked on{" "}
                      {new Date(wallet.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleUnlink(wallet.address)}
                    disabled={unlinkingAddress === wallet.address}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title="Unlink wallet"
                  >
                    {unlinkingAddress === wallet.address ? (
                      <Spinner className="h-3.5 w-3.5" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
