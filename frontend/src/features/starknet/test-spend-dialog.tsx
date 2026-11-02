"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useStarknetWallet } from "./use-starknet-wallet";
import { useNoteStarknetTx, useSpendStarknetSession, type StarknetSessionStatus } from "@/features/agentkit/hooks/use-agents";
import { formatStrk } from "@/features/starknet/format-strk";
import { Loader2 } from "lucide-react";

const STARKNET_FAUCET_URL = "https://faucet.starknet.io/";

function remainingStrkLabel(session?: StarknetSessionStatus | null): string | null {
  if (!session?.daily_limit) return null;
  try {
    const limit = BigInt(session.daily_limit);
    const spent = BigInt(session.spent_today ?? "0");
    const rem = limit > spent ? limit - spent : BigInt(0);
    return formatStrk(rem.toString(), session.decimals ?? 18);
  } catch {
    return null;
  }
}

export function TestSpendDialog({
  agentId,
  session,
  open,
  onOpenChange,
}: {
  agentId: string;
  session?: StarknetSessionStatus | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [amount, setAmount] = useState("1");
  const [walletPicker, setWalletPicker] = useState(false);
  const [step, setStep] = useState<"config" | "connecting" | "signing">("config");
  const [dailyCapHit, setDailyCapHit] = useState(false);

  const { address, connectWallet, signAndSend, isConnecting } = useStarknetWallet();
  const spendSession = useSpendStarknetSession();
  const noteTx = useNoteStarknetTx();
  const isMainnet = session?.chain_id === "starknet:SN_MAIN";
  const remainingLabel = remainingStrkLabel(session);

  useEffect(() => {
    if (!walletPicker) return;
    let active = true;
    const timer = window.setTimeout(() => {
      document.body.style.pointerEvents = "auto";
      connectWallet()
        .then(() => {
          if (active) setStep("config");
        })
        .finally(() => {
          document.body.style.pointerEvents = "";
          if (active) setWalletPicker(false);
        });
    }, 150);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [walletPicker, connectWallet]);

  const handleSpend = async () => {
    if (!address) {
      setStep("connecting");
      setWalletPicker(true);
      return;
    }

    setStep("signing");
    setDailyCapHit(false);
    try {
      const { spend } = await spendSession.mutateAsync({ agentId, amount });

      toast.info("Sign spend in your wallet");
      const txHash = await signAndSend(spend.contract, spend.entrypoint, spend.calldata);

      try {
        await noteTx.mutateAsync({ agentId, kind: "spend", txHash, amount });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Could not save the transaction hash";
        toast.error(message);
      }
      toast.success(`Withdrew ${amount} STRK`, {
        description: `${txHash.slice(0, 8)}…${txHash.slice(-4)}`,
      });
      onOpenChange(false);
      setStep("config");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Spend failed";
      if (message.trim().toLowerCase() === "daily" || message.toLowerCase().includes("daily")) {
        setDailyCapHit(true);
      }
      toast.error(message);
      setStep("config");
    }
  };

  if (isMainnet) {
    return null;
  }

  return (
    <Dialog open={open && !walletPicker} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Get STRK</DialogTitle>
          <DialogDescription>
            Pulls STRK from the policy contract into your connected Ready wallet, up to this agent&apos;s per-call and daily budget.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="amount">Amount (STRK)</Label>
            <Input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setDailyCapHit(false);
              }}
              disabled={step !== "config"}
            />
          </div>

          {dailyCapHit && (
            <div className="rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-200/90 ring-1 ring-amber-400/25">
              <p>
                Daily budget reached{remainingLabel ? ` (${remainingLabel} remaining today)` : ""}.
              </p>
              <a
                href={STARKNET_FAUCET_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block font-medium text-amber-100 underline underline-offset-2 hover:text-white"
              >
                Open Starknet Sepolia Faucet
              </a>
            </div>
          )}

          <Button
            onClick={handleSpend}
            disabled={isConnecting || spendSession.isPending || step !== "config"}
            className="w-full"
          >
            {step === "connecting" || isConnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting wallet...
              </>
            ) : step === "signing" || spendSession.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing spend...
              </>
            ) : address ? (
              "Get STRK"
            ) : (
              "Connect Ready Wallet"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
