"use client";

import { useCallback, useState } from "react";
import { useWallet, useCreateWallet, useTransferUSDC, useWalletTransactions } from "@/features/agentkit/hooks/use-wallet";
import { resolveEnsFresh } from "@/features/agentkit/hooks/use-ens";
import { AddressOrEnsInput } from "@/features/agentkit/components/address-or-ens-input";
import { EnsAddress } from "@/features/agentkit/components/ens-address";
import { isHexAddress, looksLikeEnsName, truncateAddress } from "@/features/agentkit/lib/ens";
import { ChainSelect, explorerUrl, findChain, useChains } from "@/features/chains";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs";
import { Input } from "@/components/arc/input/input";
import { Button } from "@/components/arc/button/button";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { Badge } from "@/components/arc/badge/badge";
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Copy, ExternalLink, Wallet } from "lucide-react";

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 ring-1 ring-border"
      style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
    >
      <p className="text-xs font-medium text-faint mb-2">{label}</p>
      <p className={`text-2xl ${accent ??"text-foreground"}`}>{value}</p>
    </div>
  );
}

export default function WalletPage() {
  const { data: wallet, isLoading, error } = useWallet();
  const createWallet = useCreateWallet();
  const transfer = useTransferUSDC();
  const { data: txData } = useWalletTransactions();
  const { data: chains } = useChains();
  const chain = findChain(chains, wallet?.network);
  const networkName = chain?.display_name ?? wallet?.network ?? "Unknown network";

  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [previewResolved, setPreviewResolved] = useState<string | null>(null);
  const [confirmAddress, setConfirmAddress] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState<string | null>(null);
  const [resolvingFresh, setResolvingFresh] = useState(false);
  const [txResult, setTxResult] = useState<{ transaction_hash: string; basescan_url: string } | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const onResolvedAddressChange = useCallback((address: string | null) => {
    setPreviewResolved(address);
    setConfirmAddress(null);
    setConfirmName(null);
  }, []);

  const copyAddress = () => {
    if (wallet?.address) void navigator.clipboard.writeText(wallet.address);
  };

  const resetConfirm = () => {
    setConfirmAddress(null);
    setConfirmName(null);
  };

  const handlePrepareTransfer = async () => {
    if (!toAddress.trim() || !amount.trim()) return;
    setTxError(null);
    setTxResult(null);
    resetConfirm();

    const input = toAddress.trim();
    try {
      if (isHexAddress(input)) {
        setConfirmAddress(input);
        setConfirmName(null);
        return;
      }
      if (!looksLikeEnsName(input)) {
        setTxError("Enter a 0x address or an ENS name (e.g. alice.eth)");
        return;
      }
      setResolvingFresh(true);
      const result = await resolveEnsFresh(input);
      if (!result.address) {
        setTxError("ENS resolution returned no address");
        return;
      }
      setConfirmAddress(result.address);
      setConfirmName(result.name);
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "ENS resolution failed");
    } finally {
      setResolvingFresh(false);
    }
  };

  const handleConfirmTransfer = async () => {
    if (!confirmAddress || !amount.trim()) return;
    setTxError(null);
    setTxResult(null);
    try {
      const result = await transfer.mutateAsync({
        to_address: confirmAddress,
        amount,
      });
      setTxResult(result);
      setToAddress("");
      setAmount("");
      setPreviewResolved(null);
      resetConfirm();
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Transfer failed");
    }
  };

  const transactions = txData?.transactions ?? [];

  if (isLoading) {
    return (
      <div className="relative flex flex-col">
        <PageHeader icon={Wallet} title="Wallet" description="Your testnet wallet." />
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton lines={4} key={i} className="h-24" />)}
          </div>
        </div>
      </div>
    );
  }

  if (error || !wallet || (wallet as Record<string, unknown>).error) {
    return (
      <div className="relative flex flex-col">
        <div className="pointer-events-none absolute inset-x-6 top-0 overflow-hidden" style={{ height: "300px" }}>
          
        </div>
        <PageHeader icon={Wallet} title="Wallet" description="Your testnet wallet." />
        <div className="relative z-10 flex flex-col items-center gap-6 p-12">
          <div
            className="w-full max-w-sm rounded-2xl p-8 ring-1 ring-border flex flex-col items-center gap-4 text-center"
            style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
          >
            <Wallet className="h-10 w-10 text-success" />
            <p className="text-sm text-subtle">No wallet yet. Create one to get started.</p>
            <Button
              onClick={() => createWallet.mutate()}
              disabled={createWallet.isPending}
              className="bg-success hover:bg-success w-full"
            >
              {createWallet.isPending ? "Creating…" : "Create Wallet"}
            </Button>
            {createWallet.isError && (
              <p className="text-xs text-danger">{createWallet.error?.message}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col">

      <div className="pointer-events-none absolute inset-x-6 top-0 overflow-hidden" style={{ height: "300px" }}>
        
        
      </div>

      <PageHeader
        icon={Wallet}
        title="Wallet"
        description={`Your ${networkName} wallet, balances and transfers.`}
      />

      <div className="relative z-10 flex flex-col gap-6 p-6">

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard label="USDC Balance" value={wallet.usdc ?? (wallet as Record<string, string>).usdc ?? "0.00"} accent="text-success" />
          <StatCard label="ETH Balance" value={wallet.eth ?? (wallet as Record<string, string>).eth ?? "0.000"} />
          <StatCard label="Network" value={networkName} />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="border border-border bg-surface-muted">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="transactions">Transactions ({transactions.length})</TabsTrigger>
            <TabsTrigger value="transfer">Transfer</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <div
              className="rounded-2xl p-4 ring-1 ring-border space-y-4"
              style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-subtle shrink-0">Address</span>
                <div className="flex items-center gap-2 min-w-0">
                  <EnsAddress
                    address={wallet.address}
                    fullFallback
                    className="text-sm text-foreground truncate"
                  />
                  <Button variant="ghost" onClick={copyAddress} className="h-6 w-6 text-subtle hover:text-foreground shrink-0">
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-subtle">Network</span>
                <span className="text-sm text-foreground">{networkName}</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="transactions" className="mt-4">
            <div
              className="overflow-hidden rounded-2xl ring-1 ring-border"
              style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
            >
              {transactions.length === 0 ? (
                <div className="py-12 flex flex-col items-center gap-3 text-center">
                  <p className="text-sm text-faint">No platform transactions yet</p>
                  {wallet?.address && chain && (
                    <a
                      href={explorerUrl(chain, "address", wallet.address)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-xs text-info hover:text-info"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View full on-chain history on the explorer
                    </a>
                  )}
                </div>
              ) : (
                <SortableDataTable
                  caption="Transactions"
                  rowKey="transaction_hash"
                  rows={transactions.map((tx: { transaction_hash: string; currency: string; amount: string; status: string; timestamp: string; basescan_url: string }) => ({ ...tx }))}
                  columns={[
                    { key: "currency", label: "Type", sortable: true },
                    { key: "amount", label: "Amount", sortable: true },
                    { key: "status", label: "Status", sortable: true, render: (v) => <Badge outline tone={v === "completed" ? "success" : "warning"}>{v as string}</Badge> },
                    { key: "timestamp", label: "Date", sortable: true, render: (v) => new Date(v as string).toLocaleDateString() },
                    { key: "basescan_url", label: "Explorer", render: (v) => v ? (
                      <a href={v as string} target="_blank" rel="noreferrer" aria-label="Open in explorer">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null },
                  ]}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="transfer" className="mt-4">
            <div
              className="rounded-2xl p-5 ring-1 ring-border space-y-4"
              style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
            >
              <div className="space-y-2">
                <label htmlFor="transfer-network" className="text-xs text-subtle">Network</label>
                <ChainSelect id="transfer-network" registry={chains} active={chain} capability="transfer_stablecoin" className="w-full" />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-subtle">To address or ENS name</label>
                <AddressOrEnsInput
                  value={toAddress}
                  onChange={(v) => {
                    setToAddress(v);
                    resetConfirm();
                  }}
                  onResolvedAddressChange={onResolvedAddressChange}
                  className="border-border bg-surface-muted text-foreground placeholder:text-faint"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-subtle">Amount (USDC)</label>
                <Input
                  label="0.00" placeholder="0.00"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    resetConfirm();
                  }}
                  className="border-border bg-surface-muted text-foreground placeholder:text-faint"
                />
              </div>

              {!confirmAddress ? (
                <Button
                  onClick={handlePrepareTransfer}
                  disabled={
                    resolvingFresh ||
                    transfer.isPending ||
                    !toAddress.trim() ||
                    !amount.trim() ||
                    (looksLikeEnsName(toAddress.trim()) && !previewResolved && !isHexAddress(toAddress.trim()))
                  }
                  className="w-full bg-success hover:bg-success"
                >
                  {resolvingFresh ? "Resolving…" : "Review transfer"}
                </Button>
              ) : (
                <div className="space-y-3 rounded-xl border border-warning/30 bg-warning/10 p-4">
                  <p className="text-sm text-warning">
                    Send <span className="font-medium">{amount}</span> USDC to
                    {confirmName ? (
                      <>
                        {" "}
                        <span className="font-medium">{confirmName}</span>
                        {" → "}
                      </>
                    ) : (
                      " "
                    )}
                    <span className="font-mono text-xs break-all">{confirmAddress}</span>
                    ?
                  </p>
                  <p className="text-xs text-subtle">
                    Confirm the checksummed address before sending. Payment records store the address, not the name.
                    {confirmName ? ` (${truncateAddress(confirmAddress)})` : null}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      onClick={resetConfirm}
                      disabled={transfer.isPending}
                      className="flex-1 text-foreground"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleConfirmTransfer}
                      disabled={transfer.isPending}
                      className="flex-1 bg-success hover:bg-success"
                    >
                      {transfer.isPending ? "Sending…" : "Confirm & send"}
                    </Button>
                  </div>
                </div>
              )}

              {txResult && (
                <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success">
                  Transfer submitted!{" "}
                  <a href={txResult.basescan_url} target="_blank" rel="noreferrer" className="underline">
                    View on explorer
                  </a>
                </div>
              )}
              {txError && (
                <p className="text-sm text-danger">{txError}</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
