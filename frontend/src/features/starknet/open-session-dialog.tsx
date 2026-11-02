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
import { useNoteStarknetTx, useOpenStarknetSession } from "@/features/agentkit/hooks/use-agents";
import { Loader2 } from "lucide-react";

export function OpenSessionDialog({
  agentId,
  open,
  onOpenChange,
}: {
  agentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [maxPerProposal, setMaxPerProposal] = useState("50");
  const [dailyBudget, setDailyBudget] = useState("200");
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [step, setStep] = useState<"config" | "connecting" | "signing">("config");
  const [walletPicker, setWalletPicker] = useState(false);

  const { address, connectWallet, signAndSend, isConnecting } = useStarknetWallet();
  const openSession = useOpenStarknetSession();
  const noteTx = useNoteStarknetTx();

  useEffect(() => {
    if (!walletPicker) return;
    let active = true;
    const timer = window.setTimeout(() => {
      document.body.style.pointerEvents = "auto";
      connectWallet()
        .then((connected) => {
          if (!active) return;
          if (connected) {
            toast.success("Wallet connected", {
              description: "Click Open Session to sign register_session.",
            });
          }
          setStep("config");
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

  const handleOpen = async () => {
    if (!address) {
      setStep("connecting");
      setWalletPicker(true);
      return;
    }

    setStep("signing");
    try {
      const { register_session } = await openSession.mutateAsync({
        agentId,
        owner: address,
        maxPerProposal: parseFloat(maxPerProposal),
        dailyBudget: parseFloat(dailyBudget),
        expiresInDays: parseInt(expiresInDays, 10),
      });

      toast.info("Sign register_session in your wallet");
      const txHash = await signAndSend(
        register_session.contract,
        register_session.entrypoint,
        register_session.calldata,
      );

      try {
        await noteTx.mutateAsync({ agentId, kind: "register", txHash });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Could not save the transaction hash";
        toast.error(message);
      }
      toast.success("Session opened", {
        description: `Transaction ${txHash.slice(0, 8)}…${txHash.slice(-4)}. Redirecting to chat.`,
      });
      onOpenChange(false);
      setStep("config");
      window.setTimeout(() => {
        window.location.href = `/agents/chat?agentId=${encodeURIComponent(agentId)}`;
      }, 800);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to open session";
      toast.error(message);
      setStep("config");
    }
  };

  return (
    <Dialog open={open && !walletPicker} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Open Starknet Session</DialogTitle>
          <DialogDescription>
            Set spending caps. Ready owner signs register_session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="max-per-proposal">Max per proposal (STRK)</Label>
            <Input
              id="max-per-proposal"
              type="number"
              value={maxPerProposal}
              onChange={(e) => setMaxPerProposal(e.target.value)}
              disabled={step !== "config"}
            />
          </div>

          <div>
            <Label htmlFor="daily-budget">Daily budget (STRK)</Label>
            <Input
              id="daily-budget"
              type="number"
              value={dailyBudget}
              onChange={(e) => setDailyBudget(e.target.value)}
              disabled={step !== "config"}
            />
          </div>

          <div>
            <Label htmlFor="expires-in-days">Expires in (days)</Label>
            <Input
              id="expires-in-days"
              type="number"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              disabled={step !== "config"}
            />
          </div>

          {address && (
            <p className="text-center font-mono text-[11px] text-white/50">
              Connected Wallet: {address.slice(0, 6)}…{address.slice(-4)}
            </p>
          )}

          <Button
            onClick={handleOpen}
            disabled={isConnecting || openSession.isPending || step !== "config"}
            className="w-full"
          >
            {step === "connecting" || isConnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting wallet...
              </>
            ) : step === "signing" || openSession.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Opening session...
              </>
            ) : address ? (
              "Open Session"
            ) : (
              "Connect Ready Wallet"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
