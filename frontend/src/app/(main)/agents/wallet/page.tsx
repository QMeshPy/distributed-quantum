"use client";

import { useState } from "react";
import { useWallet, useCreateWallet, useTransferUSDC, useWalletTransactions } from "@/features/agentkit/hooks/use-wallet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, ExternalLink } from "lucide-react";

export default function WalletPage() {
  const { data: wallet, isLoading, error } = useWallet();
  const createWallet = useCreateWallet();
  const transfer = useTransferUSDC();
  const { data: txData } = useWalletTransactions();

  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [txResult, setTxResult] = useState<{ transaction_hash: string; basescan_url: string } | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const copyAddress = () => {
    if (wallet?.wallet_address) void navigator.clipboard.writeText(wallet.wallet_address);
  };

  const handleTransfer = async () => {
    if (!toAddress.trim() || !amount.trim()) return;
    setTxError(null);
    setTxResult(null);
    try {
      const result = await transfer.mutateAsync({ to_address: toAddress, amount });
      setTxResult(result);
      setToAddress("");
      setAmount("");
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Transfer failed");
    }
  };

  const transactions = txData?.transactions ?? [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  // Wallet doesn't exist yet
  if (error || !wallet || (wallet as Record<string, unknown>).error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Wallet</h1>
        <Card className="border-white/10 bg-white/[0.025]">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <p className="text-white/60">No wallet yet. Create one to get started on Base Sepolia.</p>
            <Button
              onClick={() => createWallet.mutate()}
              disabled={createWallet.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {createWallet.isPending ? "Creating…" : "Create Wallet"}
            </Button>
            {createWallet.isError && (
              <p className="text-sm text-red-400">{createWallet.error?.message}</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Wallet</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-white/10 bg-white/[0.025]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/60">USDC Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-400">{wallet.usdc_balance ?? (wallet as Record<string, string>).usdc ?? "0.00"}</p>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/[0.025]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/60">ETH Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-white">{wallet.eth_balance ?? (wallet as Record<string, string>).eth ?? "0.000"}</p>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/[0.025]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/60">Network</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-white">{wallet.network_id ?? (wallet as Record<string, string>).network ?? "base-sepolia"}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="border border-white/10 bg-white/[0.025]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions ({transactions.length})</TabsTrigger>
          <TabsTrigger value="transfer">Transfer</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="border-white/10 bg-white/[0.025]">
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Address</span>
                <div className="flex items-center gap-2">
                  <code className="text-sm text-white">{wallet.wallet_address ?? "—"}</code>
                  <Button variant="ghost" size="icon" onClick={copyAddress} className="h-6 w-6">
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Network</span>
                <span className="text-sm text-white">{wallet.network_id ?? (wallet as Record<string, string>).network ?? "base-sepolia"}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          <Card className="border-white/10 bg-white/[0.025]">
            {transactions.length === 0 ? (
              <CardContent className="py-8 text-center text-white/40">
                No transactions yet
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10">
                    <TableHead className="text-white/60">Type</TableHead>
                    <TableHead className="text-white/60">Amount</TableHead>
                    <TableHead className="text-white/60">Status</TableHead>
                    <TableHead className="text-white/60">Date</TableHead>
                    <TableHead className="text-white/60" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx: { transaction_hash: string; currency: string; amount: string; status: string; timestamp: string; basescan_url: string }) => (
                    <TableRow key={tx.transaction_hash} className="border-white/10">
                      <TableCell className="text-white">{tx.currency}</TableCell>
                      <TableCell className="text-white">{tx.amount}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={tx.status === "completed" ? "text-emerald-400" : "text-amber-400"}>
                          {tx.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-white/60">{new Date(tx.timestamp).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {tx.basescan_url && (
                          <a href={tx.basescan_url} target="_blank" rel="noreferrer">
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="transfer" className="mt-4">
          <Card className="border-white/10 bg-white/[0.025]">
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-2">
                <label className="text-sm text-white/60">To Address</label>
                <Input
                  placeholder="0x…"
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                  className="border-white/10 bg-white/[0.025] text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-white/60">Amount (USDC)</label>
                <Input
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="border-white/10 bg-white/[0.025] text-white"
                />
              </div>
              <Button
                onClick={handleTransfer}
                disabled={transfer.isPending || !toAddress || !amount}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                {transfer.isPending ? "Sending…" : "Send USDC"}
              </Button>
              {txResult && (
                <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                  Transfer submitted!{" "}
                  <a href={txResult.basescan_url} target="_blank" rel="noreferrer" className="underline">
                    View on Basescan
                  </a>
                </div>
              )}
              {txError && (
                <p className="text-sm text-red-400">{txError}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
