"use client";
import type { ReactNode } from "react";

interface TrialExpiredOverlayProps {
  endsAt: Date | null;
  /** The upgrade control, supplied by the billing feature. */
  action: ReactNode;
}

export function TrialExpiredOverlay({ endsAt, action }: TrialExpiredOverlayProps) {
  const endedDateStr = endsAt
    ? endsAt.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl p-8 max-w-sm w-full mx-4 shadow-lg text-center">
        <p className="text-xl font-normal text-foreground">
          Your 1-hour trial has ended
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Upgrade to continue using Distributed Quantum Services. Your data and
          runs are safe.
        </p>
        {endedDateStr ? (
          <p className="text-xs text-muted-foreground mt-1">
            Trial ended on {endedDateStr}
          </p>
        ) : null}
        <div className="mt-6">{action}</div>
        <p className="text-xs text-muted-foreground mt-3">
          Questions? Contact support@distributed-quantum.com
        </p>
      </div>
    </div>
  );
}
