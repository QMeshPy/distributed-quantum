"use client";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { supports } from "../lib/chains";
import type { Chain, ChainCapability, ChainsResponse } from "../types";

/**
 * Lists every enabled network. Only `active` (the network the backend wallet
 * runs on) is selectable, and only if it supports `capability`; the others are
 * shown so users can see what exists, until the backend accepts a network per request.
 */
export function ChainSelect({
  registry,
  active,
  capability,
  id,
  className,
}: {
  registry: ChainsResponse | undefined;
  active: Chain | undefined;
  capability: ChainCapability;
  id?: string;
  className?: string;
}) {
  if (!registry) return null;
  return (
    <NativeSelect id={id} className={className} value={active?.chain_id ?? ""} onChange={() => {}}>
      {!active && <NativeSelectOption value="">Unknown network</NativeSelectOption>}
      {registry.chains.map((chain) => {
        const usable = chain.chain_id === active?.chain_id && supports(chain, capability);
        return (
          <NativeSelectOption key={chain.chain_id} value={chain.chain_id} disabled={!usable}>
            {chain.display_name}
            {usable ? "" : " (not available)"}
          </NativeSelectOption>
        );
      })}
    </NativeSelect>
  );
}
