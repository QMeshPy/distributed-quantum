"use client";
import { Select } from "@/components/arc/select/select";
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
    <Select
      label="Network"
      id={id}
      className={className}
      value={active?.chain_id ?? ""}
      onValueChange={() => {}}
      options={[
        ...(active ? [] : [{ value: "", label: "Unknown network" }]),
        ...registry.chains.map((chain) => {
          const usable = chain.chain_id === active?.chain_id && supports(chain, capability);
          return { value: chain.chain_id, label: `${chain.display_name}${usable ? "" : " (not available)"}`, disabled: !usable };
        }),
      ]}
    />
  );
}
