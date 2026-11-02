"use client";

import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { humanWhen, useRefreshStarknetTxs, type StarknetCall, type StarknetSessionStatus } from "@/features/agentkit/hooks/use-agents";
import { TxLink } from "@/features/starknet/tx-link";

const CALL_LABEL: Record<string, string> = {
  register: "Register session",
  spend: "Spend",
  revoke: "Revoke session",
};

const RECEIPT_LABEL: Record<string, string> = {
  pending: "Pending",
  not_found: "Submitted",
  confirmed: "Confirmed",
  failed: "Failed",
};

function receiptClass(status: string | undefined) {
  if (status === "confirmed") return "text-green-300";
  if (status === "failed") return "text-red-300";
  return "text-amber-300";
}

function callTitle(call: StarknetCall) {
  if (call.kind === "spend" && call.amount) return `Spend ${call.amount} STRK`;
  return CALL_LABEL[call.kind] ?? call.kind;
}

export function SessionHistoryDialog({
  agentId,
  session,
  open,
  onOpenChange,
}: {
  agentId: string;
  session: StarknetSessionStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const refresh = useRefreshStarknetTxs();
  const calls = [...(session.calls ?? [])].sort(
    (a, b) => (b.submitted_at ?? 0) - (a.submitted_at ?? 0),
  );
  const waiting = calls.some((call) => call.status !== "confirmed" && call.status !== "failed");

  useEffect(() => {
    if (!open) return;
    refresh.mutate(agentId);
    if (!waiting) return;
    const timer = window.setInterval(() => refresh.mutate(agentId), 60_000);
    return () => window.clearInterval(timer);
  }, [open, agentId, waiting]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onClick={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Transaction history</DialogTitle>
          <DialogDescription>
            Register, spend, and revoke on Starknet Sepolia. Status follows the transaction receipt.
          </DialogDescription>
        </DialogHeader>
        {calls.length === 0 ? (
          <p className="rounded-xl px-4 py-8 text-center text-sm text-white/45 ring-1 ring-white/10">
            No records yet.
          </p>
        ) : (
          <ul className="max-h-[360px] space-y-2.5 overflow-y-auto">
            {calls.map((call) => {
              const when = humanWhen(
                typeof call.submitted_at === "number" ? call.submitted_at * 1000 : call.submitted_at,
              );
              const status = call.status ?? "pending";
              return (
                <li key={call.tx_hash} className="rounded-xl px-4 py-3 ring-1 ring-white/10">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-white/85">{callTitle(call)}</span>
                    <span className={`text-xs ${receiptClass(status)}`}>
                      {RECEIPT_LABEL[status] ?? status}
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-4 text-xs">
                    <TxLink hash={call.tx_hash} chainId={session.chain_id} />
                    <span className="text-white/40" title={when?.exact}>
                      {when ? when.exact : "—"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
