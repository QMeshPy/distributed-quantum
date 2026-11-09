"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { shortAddress } from "@/features/agentkit/hooks/use-agents";

export function WalletAddressCopy({ address, className = "" }: { address: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!address) return <span className={className}>—</span>;

  const copy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      toast.error("Could not copy the wallet address");
      return;
    }
    setCopied(true);
    toast.success("Wallet address copied");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? address : `Copy ${address}`}
      aria-label={copied ? "Wallet address copied" : "Copy wallet address"}
      className={`group inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono tracking-wide ring-1 transition-colors ${
        copied
          ? "text-emerald-400 ring-emerald-400/30 bg-emerald-400/10"
          : "text-white/70 ring-white/10 hover:bg-white/6 hover:text-white"
      } ${className}`}
    >
      <span>{shortAddress(address)}</span>
      {copied ? (
        <span className="inline-flex items-center gap-1 font-sans text-[11px] tracking-normal">
          <Check className="h-3 w-3" />
          Copied
        </span>
      ) : (
        <Copy className="h-3 w-3 text-white/40 transition-colors group-hover:text-white/80" />
      )}
    </button>
  );
}
