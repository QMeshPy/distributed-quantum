"use client";

import { useEffect } from "react";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
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
  if (status === "confirmed") return "text-success";
  if (status === "failed") return "text-danger";
  return "text-warning";
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
      <DialogContent
        title="Transaction history"
        description="Register, spend, and revoke on Starknet Sepolia. Status follows the transaction receipt."
        onClick={(event) => event.stopPropagation()}
      >
        {calls.length === 0 ? (
          <p className="rounded-xl px-4 py-8 text-center text-sm text-subtle ring-1 ring-border">
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
                <li key={call.tx_hash} className="rounded-xl px-4 py-3 ring-1 ring-border">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-foreground">{callTitle(call)}</span>
                    <span className={`text-xs ${receiptClass(status)}`}>
                      {RECEIPT_LABEL[status] ?? status}
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-4 text-xs">
                    <TxLink hash={call.tx_hash} chainId={session.chain_id} />
                    <span className="text-subtle" title={when?.exact}>
                      {when ? when.exact : "-"}
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
