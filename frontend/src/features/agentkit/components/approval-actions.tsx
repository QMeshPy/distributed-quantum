"use client";

import { Check, ShieldQuestion, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApprovalRequest } from "@/features/agentkit/hooks/use-chat-sessions";

/** Approve / Decline for an agent turn that ended with `request_approval`. */
export function ApprovalActions({
  approval,
  showSummary,
  disabled,
  onDecide,
}: {
  approval: ApprovalRequest;
  showSummary: boolean;
  disabled: boolean;
  onDecide: (approved: boolean) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Approval request"
      className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-amber-400/5 px-3 py-2.5 ring-1 ring-amber-400/25"
    >
      <div className="mr-auto flex min-w-0 items-start gap-2">
        <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/80" aria-hidden />
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-white/85">Your agent is waiting for approval</p>
          {showSummary && (
            <p className="text-[12px] leading-relaxed text-white/60 [overflow-wrap:anywhere]">
              {approval.summary}
            </p>
          )}
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={() => onDecide(false)}
        className="h-8 cursor-pointer text-white/70 ring-1 ring-white/10 hover:bg-white/6 hover:text-white"
      >
        <X className="mr-1 h-3.5 w-3.5" aria-hidden />
        Decline
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={disabled}
        onClick={() => onDecide(true)}
        className="h-8 cursor-pointer"
      >
        <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
        {approval.action}
      </Button>
    </div>
  );
}
