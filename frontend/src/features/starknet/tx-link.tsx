"use client";

import { explorerUrl, findChain, useChains } from "@/features/chains";

const FALLBACK_TX: Record<string, string> = {
  "starknet:SN_SEPOLIA": "https://sepolia.voyager.online/tx/",
  "starknet:SN_MAIN": "https://voyager.online/tx/",
};

export function shortTx(hash: string) {
  const body = hash.startsWith("0x") ? hash.slice(2) : hash;
  if (body.length <= 12) return hash;
  return `0x${body.slice(0, 6)}…${body.slice(-4)}`;
}

export function TxLink({ hash, chainId }: { hash: string; chainId?: string }) {
  const { data: chains } = useChains();
  const id = chainId || "starknet:SN_SEPOLIA";
  const chain = findChain(chains, id);
  const href = chain
    ? explorerUrl(chain, "transaction", hash)
    : `${FALLBACK_TX[id] ?? FALLBACK_TX["starknet:SN_SEPOLIA"]}${encodeURIComponent(hash)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={hash}
      onClick={(event) => event.stopPropagation()}
      className="font-mono text-purple-200 underline decoration-purple-400/40 underline-offset-2 hover:text-white"
    >
      {shortTx(hash)}
    </a>
  );
}
