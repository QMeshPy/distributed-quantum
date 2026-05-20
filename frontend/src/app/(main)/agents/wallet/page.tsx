"use client";

import { useState } from "react";
import { useWallet, useCreateWallet, useTransferUSDC, useWalletTransactions } from "@/features/agentkit/hooks/use-wallet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Copy, ExternalLink, Wallet } from "lucide-react";

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 ring-1 ring-white/8"
      style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/30 mb-2">{label}</p>
      <p className={`text-2xl font-light tracking-tight ${accent ?? "text-white/90"}`}>{value}</p>
    </div>
  );
}

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
    if (wallet?.address) void navigator.clipboard.writeText(wallet.address);
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
      <div className="relative flex flex-col">
        <PageHeader icon={Wallet} label="AgentKit" title="Wallet" description="Your Base Sepolia wallet." glow="emerald" />
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl bg-white/[0.04]" />)}
          </div>
        </div>
      </div>
    );
  }

  if (error || !wallet || (wallet as Record<string, unknown>).error) {
    return (
      <div className="relative flex flex-col">
        <div className="pointer-events-none absolute inset-x-6 top-0 overflow-hidden" style={{ height: "300px" }}>
          <div className="absolute h-[260px] w-[260px] rounded-full opacity-20 blur-[80px]" style={{ left: "10%", top: "-40px", background: "radial-gradient(circle, rgba(52,211,153,0.65) 0%, transparent 70%)" }} />
        </div>
        <PageHeader icon={Wallet} label="AgentKit" title="Wallet" description="Your Base Sepolia wallet." glow="emerald" />
        <div className="relative z-10 flex flex-col items-center gap-6 p-12">
          <div
            className="w-full max-w-sm rounded-2xl p-8 ring-1 ring-white/8 flex flex-col items-center gap-4 text-center"
            style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
          >
            <Wallet className="h-10 w-10 text-emerald-400/60" />
            <p className="text-sm text-white/50">No wallet yet. Create one to get started on Base Sepolia.</p>
            <Button
              onClick={() => createWallet.mutate()}
              disabled={createWallet.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 w-full"
            >
              {createWallet.isPending ? "Creating…" : "Create Wallet"}
            </Button>
            {createWallet.isError && (
              <p className="text-xs text-red-400">{createWallet.error?.message}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col">

      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-x-6 top-0 overflow-hidden" style={{ height: "300px" }}>
        <div className="absolute h-[280px] w-[280px] rounded-full opacity-20 blur-[80px]" style={{ left: "0%", top: "-50px", background: "radial-gradient(circle, rgba(52,211,153,0.65) 0%, transparent 70%)" }} />
        <div className="absolute h-[220px] w-[220px] rounded-full opacity-15 blur-[70px]" style={{ right: "5%", top: "-30px", background: "radial-gradient(circle, rgba(16,185,129,0.6) 0%, transparent 70%)" }} />
      </div>

      <PageHeader
        icon={Wallet}
        label="AgentKit"
        title="Wallet"
        description="Your Base Sepolia wallet — balances and transfers."
        glow="emerald"
      />

      <div className="relative z-10 flex flex-col gap-6 p-6">

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard label="USDC Balance" value={wallet.usdc ?? (wallet as Record<string, string>).usdc ?? "0.00"} accent="text-emerald-400" />
          <StatCard label="ETH Balance" value={wallet.eth ?? (wallet as Record<string, string>).eth ?? "0.000"} />
          <StatCard label="Network" value={wallet.network ?? (wallet as Record<string, string>).network ?? "base-sepolia"} />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="border border-white/10 bg-white/[0.025]">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="transactions">Transactions ({transactions.length})</TabsTrigger>
            <TabsTrigger value="transfer">Transfer</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <div
              className="rounded-2xl p-4 ring-1 ring-white/8 space-y-4"
              style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40 uppercase tracking-wider">Address</span>
                <div className="flex items-center gap-2">
                  <code className="text-sm text-white/80">{wallet.address ?? "—"}</code>
                  <Button variant="ghost" size="icon" onClick={copyAddress} className="h-6 w-6 text-white/40 hover:text-white">
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40 uppercase tracking-wider">Network</span>
                <span className="text-sm text-white/80">{wallet.network ?? (wallet as Record<string, string>).network ?? "base-sepolia"}</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="transactions" className="mt-4">
            <div
              className="overflow-hidden rounded-2xl ring-1 ring-white/8"
              style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
            >
              {transactions.length === 0 ? (
                <div className="py-12 flex flex-col items-center gap-3 text-center">
                  <p className="text-sm text-white/30">No platform transactions yet</p>
                  {wallet?.address && (
                    <a
                      href={`https://sepolia.basescan.org/address/${wallet.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View full on-chain history on Basescan
                    </a>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/8 hover:bg-transparent">
                      <TableHead className="text-[11px] uppercase tracking-wider text-white/30">Type</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-white/30">Amount</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-white/30">Status</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-white/30">Date</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx: { transaction_hash: string; currency: string; amount: string; status: string; timestamp: string; basescan_url: string }) => (
                      <TableRow key={tx.transaction_hash} className="border-white/8 hover:bg-white/[0.03]">
                        <TableCell className="text-sm text-white/80">{tx.currency}</TableCell>
                        <TableCell className="text-sm text-white/80">{tx.amount}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={tx.status === "completed" ? "text-emerald-400 border-emerald-400/30 text-[10px]" : "text-amber-400 border-amber-400/30 text-[10px]"}>
                            {tx.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-white/30">{new Date(tx.timestamp).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {tx.basescan_url && (
                            <a href={tx.basescan_url} target="_blank" rel="noreferrer">
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-white/30 hover:text-white">
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
            </div>
          </TabsContent>

          <TabsContent value="transfer" className="mt-4">
            <div
              className="rounded-2xl p-5 ring-1 ring-white/8 space-y-4"
              style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
            >
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-white/40">To Address</label>
                <Input
                  placeholder="0x…"
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                  className="border-white/10 bg-white/[0.025] text-white placeholder:text-white/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-white/40">Amount (USDC)</label>
                <Input
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="border-white/10 bg-white/[0.025] text-white placeholder:text-white/20"
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
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                  Transfer submitted!{" "}
                  <a href={txResult.basescan_url} target="_blank" rel="noreferrer" className="underline">
                    View on Basescan
                  </a>
                </div>
              )}
              {txError && (
                <p className="text-sm text-red-400">{txError}</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
