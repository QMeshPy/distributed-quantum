"use client";

import { Tooltip } from "@/components/arc/tooltip/tooltip";
import { useEnsReverse } from "../hooks/use-ens";
import { isHexAddress, truncateAddress } from "../lib/ens";

type EnsAddressProps = {
  address: string | null | undefined;
  /** Show the full address instead of a truncated form when no name is set. */
  fullFallback?: boolean;
  className?: string;
  monoClassName?: string;
};

/**
 * Display a primary ENS name when set, otherwise the (truncated) address.
 * Reverse lookup failures fall back to the address, never invent a name.
 */
export function EnsAddress({
  address,
  fullFallback = false,
  className,
  monoClassName = "font-mono",
}: EnsAddressProps) {
  const trimmed = (address ?? "").trim();
  const { data } = useEnsReverse(isHexAddress(trimmed) ? trimmed : null);
  const primary = data?.name?.trim() || null;
  const fallback = fullFallback ? trimmed : truncateAddress(trimmed);
  const label = primary ?? (fallback || "-");

  if (!trimmed) {
    return <span className={className}>-</span>;
  }

  return (
    <Tooltip
      content={
        <div className="space-y-0.5">
          {primary ? <p className="text-xs">{primary}</p> : null}
          <p className="font-mono text-xs">{trimmed}</p>
        </div>
      }
    >
      <span
        className={[className, primary ? undefined : monoClassName]
          .filter(Boolean)
          .join(" ")}
      >
        {label}
      </span>
    </Tooltip>
  );
}
