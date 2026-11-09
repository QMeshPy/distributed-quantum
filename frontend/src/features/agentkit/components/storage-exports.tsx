"use client";
import { Button } from "@/components/ui/button";
import { explorerUrl, findChain, useChains } from "@/features/chains";
import { STORAGE_PAYMENT_CHAIN_ID } from "@/constants";
import type { StorageExport } from "../hooks/use-storage-exports";
export function StorageExports({ items, busy, error, decide }: { items: StorageExport[]; busy: boolean; error?: string; decide: (item: StorageExport, action: "approve" | "cancel" | "reconcile") => void }) {
  const { data: chains } = useChains();
  const chain = findChain(chains, STORAGE_PAYMENT_CHAIN_ID);
  if (!items.length && !error) return null;
  return <section aria-label="Storage approvals" className="space-y-3">
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {items.map(item => <article key={item.id} className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-sm">
      <div className="flex items-center justify-between gap-4"><h3 className="font-medium">{item.title}</h3><span className="text-xs uppercase">{item.status}</span></div>
      <p className="mt-2 text-muted-foreground">{item.bytes.toLocaleString()} bytes · 30 days minimum · {item.usdc} test USDC · {chain?.display_name ?? STORAGE_PAYMENT_CHAIN_ID}</p>
      <p className="mt-2">This export will be public on IPFS. Anyone with its link can read and copy it. Public copies may remain after retention ends.</p>
      <details className="mt-3"><summary className="cursor-pointer">Review exact content and payment recipient</summary><pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black/10 p-3 text-xs">{item.content}</pre><p className="mt-2 break-all text-xs">Recipient: {item.payTo}<br/>SHA-256: {item.sha256}</p></details>
      {item.status === "pending" && <div className="mt-3 flex flex-wrap items-center gap-2"><Button size="sm" disabled={busy} onClick={() => decide(item, "approve")}>{busy ? "Verifying…" : "Approve & store"}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => decide(item, "cancel")}>Cancel</Button><span className="text-xs text-muted-foreground">Or reply “yes”. Approval expires {new Date(item.expires_at).toLocaleTimeString()}.</span></div>}
      {item.status === "uncertain" && <Button size="sm" className="mt-3" variant="outline" disabled={busy} onClick={() => decide(item, "reconcile")}>{busy ? "Checking…" : "Check receipt (no new payment)"}</Button>}
      {item.error && <p role="status" className="mt-3 text-amber-400">{item.error}</p>}
      {item.receipt?.verified && <div className="mt-3 space-y-1"><p>Stored and retrieved. SHA-256 verified.</p><a className="block break-all underline" href={`https://gateway.pinata.cloud/ipfs/${encodeURIComponent(item.receipt.cid)}/${encodeURIComponent(item.filename)}`} target="_blank" rel="noreferrer">Open stored artifact</a>{chain && <a className="block underline" href={explorerUrl(chain, "transaction", item.receipt.transaction)} target="_blank" rel="noreferrer">View testnet payment</a>}</div>}
    </article>)}
  </section>;
}
