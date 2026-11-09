"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useNoteStarknetTx, useRefreshStarknetTxs, useRevokeStarknetSession, type StarknetSessionStatus } from "@/features/agentkit/hooks/use-agents";
import { formatStrk } from "@/features/starknet/format-strk";
import { SessionHistoryDialog } from "@/features/starknet/session-history-dialog";
import { shortTx } from "@/features/starknet/tx-link";
import { useStarknetWallet } from "@/features/starknet/use-starknet-wallet";
import { Button } from "@/components/ui/button";
import { TrendingUp } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  revocation_pending: "Revoking",
  expired: "Expired",
  revoked: "Revoked",
};

const RECEIPT_CHECK_DELAYS_MS = [150_000, 270_000, 330_000];

function pendingSubmittedMarks(calls: StarknetSessionStatus["calls"]) {
  const marks = new Set<number>();
  for (const call of calls ?? []) {
    if (call.status === "confirmed" || call.status === "failed") continue;
    if (typeof call.submitted_at !== "number" || !Number.isFinite(call.submitted_at)) continue;
    marks.add(call.submitted_at);
  }
  return [...marks].sort((a, b) => a - b);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <span className="text-white/45">{label}</span>
      <span className="text-right text-white/80">{children}</span>
    </div>
  );
}

function SessionEndedReopen({
  compact,
  buttonLabel,
  onReopen,
}: {
  compact?: boolean;
  buttonLabel: string;
  onReopen: () => void;
}) {
  return (
    <div
      className={
        compact
          ? "mt-2 rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/12"
          : "mt-2 w-[22.5rem] rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/12"
      }
    >
      <p className="text-xs leading-relaxed text-white/60">Spending session ended.</p>
      <Button
        size="sm"
        variant="ghost"
        className="mt-2.5 h-8 w-full text-xs text-purple-100/80 ring-1 ring-purple-400/30 hover:bg-purple-500/10"
        onClick={(event) => {
          event.stopPropagation();
          onReopen();
        }}
      >
        {buttonLabel}
      </Button>
    </div>
  );
}

export function StarknetSessionPanel({
  agentId,
  session,
  variant,
  onTestSpend,
  onOpenSession,
}: {
  agentId: string;
  session: StarknetSessionStatus;
  variant: "card" | "header";
  onTestSpend?: (agentId: string) => void;
  onOpenSession?: (agentId: string) => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const revokeSession = useRevokeStarknetSession();
  const noteTx = useNoteStarknetTx();
  const refreshTxs = useRefreshStarknetTxs();
  const refreshAgent = useRef(refreshTxs.mutate);
  const receiptTimers = useRef(new Map<string, number>());
  refreshAgent.current = refreshTxs.mutate;
  const { address, connectWallet, signAndSend } = useStarknetWallet();
  const status = session.status ?? "active";
  const header = variant === "header";
  const isMainnet = session.chain_id === "starknet:SN_MAIN";
  const pendingMarks = pendingSubmittedMarks(session.calls).join(",");

  useEffect(() => {
    const timers = receiptTimers.current;
    const prefix = `${agentId}:`;
    for (const [key, timer] of timers) {
      if (key.startsWith(prefix)) continue;
      window.clearTimeout(timer);
      timers.delete(key);
    }
    const now = Date.now();
    const marks = pendingMarks ? pendingMarks.split(",").map(Number) : [];
    for (const submittedAt of marks) {
      for (const delayMs of RECEIPT_CHECK_DELAYS_MS) {
        const key = `${agentId}:${submittedAt}:${delayMs}`;
        if (timers.has(key)) continue;
        const remaining = submittedAt * 1000 + delayMs - now;
        if (remaining <= 0) continue;
        const timer = window.setTimeout(() => {
          refreshAgent.current(agentId);
        }, remaining);
        timers.set(key, timer);
      }
    }
  }, [agentId, pendingMarks]);

  useEffect(() => {
    const timers = receiptTimers.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const revoke = async (event: MouseEvent) => {
    event.stopPropagation();
    try {
      if (!address) {
        const connected = await connectWallet();
        if (!connected) return;
      }
      const prepared = await revokeSession.mutateAsync(agentId);
      toast.info("Sign revoke_session in your wallet");
      const txHash = await signAndSend(
        prepared.revoke_session.contract,
        prepared.revoke_session.entrypoint,
        prepared.revoke_session.calldata,
      );
      try {
        await noteTx.mutateAsync({ agentId, kind: "revoke", txHash });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Could not save the transaction hash";
        toast.error(message);
      }
      toast.success("Revoke submitted", { description: shortTx(txHash) });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not revoke the session";
      toast.error(message);
    }
  };

  if (header && status === "revoked") {
    return (
      <SessionEndedReopen
        buttonLabel="Open Starknet Session"
        onReopen={() => onOpenSession?.(agentId)}
      />
    );
  }

  return (
    <>
      <div
        className={
          header
            ? "mt-2 w-[22.5rem] rounded-xl bg-purple-500/[0.07] px-4 py-3.5 ring-1 ring-purple-400/35"
            : "mt-3 rounded-xl bg-purple-500/[0.05] px-4 py-3.5 ring-1 ring-purple-400/25"
        }
      >
      <div className="mb-3 flex items-center justify-between gap-4">
        <span className={header ? "text-sm font-medium text-purple-100" : "text-xs font-medium text-purple-100/90"}>
          Starknet Session
        </span>
        <span
          className={
            status === "active"
              ? "text-xs text-green-300"
              : status === "revocation_pending"
                ? "text-xs text-amber-300"
                : "text-xs text-white/50"
          }
        >
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>
      <div className={header ? "space-y-2 text-xs" : "space-y-2 text-[12px]"}>
        <Row label="Max / proposal">{formatStrk(session.max_per_call, session.decimals)}</Row>
        <Row label="Daily limit">{formatStrk(session.daily_limit, session.decimals)}</Row>
      </div>
      {header && status === "active" && (
        <p className="mt-2.5 text-[11px] leading-relaxed text-white/45">
          STRK spend caps for this agent.
        </p>
      )}
      {!header && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-3.5 h-8 w-full text-xs text-purple-100/80 ring-1 ring-purple-400/30 hover:bg-purple-500/10"
          onClick={(event) => {
            event.stopPropagation();
            setHistoryOpen(true);
          }}
        >
          Txn History
        </Button>
      )}
      {status === "active" && (
        <div className="mt-2 flex gap-2">
          {!isMainnet && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 flex-1 text-xs text-blue-200/80 ring-1 ring-blue-400/25 hover:bg-blue-500/10"
              onClick={(event) => {
                event.stopPropagation();
                onTestSpend?.(agentId);
              }}
            >
              <TrendingUp size={12} className="mr-1.5" />
              Get STRK
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 flex-1 text-xs text-white/60 ring-1 ring-white/15 hover:bg-white/6"
            disabled={revokeSession.isPending || noteTx.isPending}
            onClick={revoke}
          >
            Revoke
          </Button>
        </div>
      )}
      {status === "revocation_pending" && (
        <p className="mt-3 text-center text-[11px] leading-relaxed text-amber-200/80">
          {header
            ? "Spending session still active until the revoke is accepted on L2."
            : "Revocation is waiting on the Ready transaction."}
        </p>
      )}
      {!header && (
        <SessionHistoryDialog
          agentId={agentId}
          session={session}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
        />
      )}
      </div>
      {!header && status === "revoked" && (
        <SessionEndedReopen
          compact
          buttonLabel="Reopen starknet session"
          onReopen={() => onOpenSession?.(agentId)}
        />
      )}
    </>
  );
}
