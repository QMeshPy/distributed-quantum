"use client";

import { useState } from "react";
import { AddressOrEnsInput } from "@/features/agentkit";
import { isHexAddress } from "@/features/agentkit/lib/ens";
import { Button } from "@/components/arc/button/button";
import { cn } from "@/lib/utils";
import { useWalletPortfolio } from "../hooks/use-wallet-portfolio";
import type { WalletPortfolioAnalysis } from "../types/wallet-portfolio";

function formatUsd(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function Results({ data }: { data: WalletPortfolioAnalysis }) {
  return (
    <div className="mt-6 space-y-5 text-sm">
      <div>
        <p className="text-xs text-faint">
          Address
        </p>
        <p className="font-mono text-foreground break-all">{data.address}</p>
        <p className="mt-1 text-xs text-subtle">
          Analyzed {new Date(data.analyzed_at).toLocaleString()} · networks:{" "}
          {data.networks.length ? data.networks.join(", ") : "none"}
        </p>
      </div>

      {data.risk ? (
        <div className="space-y-2">
          <h3 className="text-base font-medium text-foreground">Risk summary</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <dt className="text-subtle">Portfolio value</dt>
            <dd>{formatUsd(data.risk.portfolio_value_usd)}</dd>
            <dt className="text-subtle">Classical VaR 95%</dt>
            <dd>{formatUsd(data.risk.classical_var_95)}</dd>
            <dt className="text-subtle">Classical VaR 99%</dt>
            <dd>{formatUsd(data.risk.classical_var_99)}</dd>
            <dt className="text-subtle">Classical CVaR 99%</dt>
            <dd>{formatUsd(data.risk.classical_cvar_99)}</dd>
            {data.risk.quantum_var_95 != null ? (
              <>
                <dt className="text-subtle">Quantum VaR 95%</dt>
                <dd>{formatUsd(data.risk.quantum_var_95)}</dd>
              </>
            ) : null}
            {data.risk.quantum_var_99 != null ? (
              <>
                <dt className="text-subtle">Quantum VaR 99%</dt>
                <dd>{formatUsd(data.risk.quantum_var_99)}</dd>
              </>
            ) : null}
            {data.risk.quantum_cvar_99 != null ? (
              <>
                <dt className="text-subtle">Quantum CVaR 99%</dt>
                <dd>{formatUsd(data.risk.quantum_cvar_99)}</dd>
              </>
            ) : null}
          </dl>
          <p className="text-xs text-subtle">
            {data.risk.confidence_note}
          </p>
        </div>
      ) : null}

      <div>
        <h3 className="text-base font-medium text-foreground">
          Priced holdings
        </h3>
        {data.priced_holdings.length === 0 ? (
          <p className="mt-1 text-subtle">None</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {data.priced_holdings.map((h) => (
              <li
                key={`${h.network}-${h.symbol}-${h.token_address ?? "native"}`}
                className="py-2"
              >
                <div className="flex justify-between gap-3">
                  <span>
                    {h.symbol}{" "}
                    <span className="text-subtle">({h.network})</span>
                  </span>
                  <span>{formatUsd(h.value_usd)}</span>
                </div>
                <p className="text-xs text-subtle">
                  bal {h.balance} · {formatUsd(h.price_usd)} · weight{" "}
                  {(h.weight * 100).toFixed(1)}% · {h.source.kind}:{" "}
                  {h.source.detail} ·{" "}
                  {new Date(h.source.observed_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-base font-medium text-foreground">
          Unpriceable holdings
        </h3>
        {data.unpriceable_holdings.length === 0 ? (
          <p className="mt-1 text-subtle">None</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {data.unpriceable_holdings.map((h) => (
              <li
                key={`${h.network}-${h.symbol}-unpriced`}
                className="py-2"
              >
                <div className="flex justify-between gap-3">
                  <span>
                    {h.symbol}{" "}
                    <span className="text-subtle">({h.network})</span>
                  </span>
                  <span className="font-mono text-xs">{h.balance}</span>
                </div>
                <p className="text-xs text-subtle">
                  {h.reason} · {new Date(h.observed_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data.data_sources.length > 0 ? (
        <div>
          <h3 className="text-base font-medium text-foreground">
            Data sources
          </h3>
          <ul className="mt-2 space-y-1 text-xs text-subtle">
            {data.data_sources.map((s, i) => (
              <li key={`${s.kind}-${s.detail}-${i}`}>
                {s.kind}: {s.detail} ·{" "}
                {new Date(s.observed_at).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.notes.length > 0 ? (
        <ul className="space-y-1 text-xs text-subtle">
          {data.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

interface WalletPortfolioPanelProps {
  className?: string;
}

export function WalletPortfolioPanel({ className }: WalletPortfolioPanelProps) {
  const [input, setInput] = useState("");
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const analyze = useWalletPortfolio();

  const address =
    resolvedAddress ?? (isHexAddress(input.trim()) ? input.trim() : null);

  const onSubmit = () => {
    if (!address) return;
    analyze.mutate({ address, networks: [] });
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <h2 className="text-base font-medium text-foreground">
          Wallet portfolio
        </h2>
        <p className="mt-1 text-xs text-subtle">
          Paste a public address or ENS name. Read-only. No signing, approvals,
          or transfers.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="wallet-portfolio-address" className="text-sm text-foreground">Address or ENS</label>
        <AddressOrEnsInput
          id="wallet-portfolio-address"
          value={input}
          onChange={setInput}
          onResolvedAddressChange={setResolvedAddress}
          placeholder="0x… or name.eth"
        />
      </div>

      <Button
        type="button"
        onClick={onSubmit}
        disabled={!address}
        loading={analyze.isPending}
      >
        {analyze.isPending ? "Analyzing…" : "Analyze holdings"}
      </Button>

      {analyze.isError ? (
        <p className="text-sm text-danger">
          {analyze.error instanceof Error
            ? analyze.error.message
            : "Analysis failed"}
        </p>
      ) : null}

      {analyze.data ? <Results data={analyze.data} /> : null}
    </div>
  );
}
