"use client";

import { useDeferredValue, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { useEnsResolve } from "../hooks/use-ens";
import { isHexAddress, looksLikeEnsName, truncateAddress } from "../lib/ens";

type AddressOrEnsInputProps = {
  value: string;
  onChange: (value: string) => void;
  /** Fires when a name resolves (preview, not fresh). Cleared on invalid input. */
  onResolvedAddressChange?: (address: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
};

/**
 * Accepts a hex address or `name.eth`. Shows resolved address preview / clear errors.
 * Never invents an address on failure.
 */
export function AddressOrEnsInput({
  value,
  onChange,
  onResolvedAddressChange,
  placeholder = "0x… or name.eth",
  disabled,
  className,
  id,
}: AddressOrEnsInputProps) {
  const deferred = useDeferredValue(value.trim());
  const isEns = looksLikeEnsName(deferred);
  const isHex = isHexAddress(deferred);
  const resolve = useEnsResolve(deferred, { enabled: isEns, fresh: false });

  let localError: string | null = null;
  if (deferred && !isHex) {
    if (!isEns) {
      localError = "Enter a 0x address or an ENS name (e.g. alice.eth)";
    } else if (resolve.isError) {
      localError = resolve.error instanceof Error
        ? resolve.error.message
        : "Could not resolve ENS name";
    }
  }
  const resolvedAddress = isHex
    ? deferred
    : isEns && !localError ? resolve.data?.address ?? null : null;

  useEffect(() => {
    onResolvedAddressChange?.(resolvedAddress);
  }, [resolvedAddress, onResolvedAddressChange]);

  const previewAddress = resolve.data?.address;

  return (
    <div className="space-y-2">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        autoComplete="off"
        spellCheck={false}
      />
      {isEns && resolve.isFetching ? (
        <p className="text-xs text-white/40">Resolving ENS name…</p>
      ) : null}
      {isEns && previewAddress && !localError ? (
        <p className="text-xs text-emerald-400/90">
          Resolves to{" "}
          <span className="font-mono">{truncateAddress(previewAddress)}</span>
          <span className="ml-1 text-white/30">(confirm before sending)</span>
        </p>
      ) : null}
      {localError ? <p className="text-xs text-red-400">{localError}</p> : null}
    </div>
  );
}
