"use client";

import { Zap, ArrowRight } from "lucide-react";
import { LinkButton } from "@/shared/components/link-button";

interface QuantumDetailsButtonProps {
  href: string;
}

export function QuantumDetailsButton({ href }: QuantumDetailsButtonProps) {
  return (
    <LinkButton href={href} size="sm" variant="secondary">
      <Zap className="h-3 w-3 shrink-0" />
      <span>Quantum Details</span>
      <ArrowRight className="h-3 w-3 shrink-0" />
    </LinkButton>
  );
}
