"use client";
import { useTrial } from "@/features/auth";
import { TrialExpiredOverlay } from "@/features/auth";

interface TrialGateProps {
  children: React.ReactNode;
}

export function TrialGate({ children }: TrialGateProps) {
  const { trialStatus, trialEndsAt, isLoading } = useTrial();

  if (isLoading || trialStatus !== "expired") {
    return <>{children}</>;
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div className="pointer-events-none select-none blur-sm">{children}</div>
      <TrialExpiredOverlay endsAt={trialEndsAt} />
    </div>
  );
}
