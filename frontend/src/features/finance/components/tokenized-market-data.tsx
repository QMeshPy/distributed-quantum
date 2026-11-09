import { DataTable } from "@/shared/components/detail/data-table";
import type { FinanceResult } from "../types";

function percent(weight: number) {
  return `${(weight * 100).toFixed(1)}%`;
}

function Address({ value }: { value: string }) {
  return (
    <span className="font-mono" title={value}>
      {`${value.slice(0, 6)}…${value.slice(-4)}`}
    </span>
  );
}

export function TokenizedMarketData({ result }: { result: FinanceResult }) {
  const data = result.market_data;
  if (!data) return null;
  const weights = result.allocation_weights;
  const provenance = result.provenance;
  return (
    <section className="space-y-3 rounded border border-border-subtle p-4">
      <h3 className="text-base font-medium">Tokenized-stock data</h3>
      {result.disclaimer ? (
        <p role="note" className="text-sm font-medium text-foreground">
          {result.disclaimer}
        </p>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-subtle">Source</dt>
        <dd>{data.source}</dd>
        <dt className="text-subtle">Read at</dt>
        <dd>
          {data.block_timestamp} (block {data.block_number})
        </dd>
        <dt className="text-subtle">Prices</dt>
        <dd>
          {data.aligned_days} daily token prices, {data.first_date} to{" "}
          {data.last_date} (requested {data.requested_start} to{" "}
          {data.requested_end})
        </dd>
        <dt className="text-subtle">Sampling</dt>
        <dd>{data.sampling}</dd>
      </dl>
      {weights ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {(["classical", "quantum"] as const).map((method) => (
            <div key={method}>
              <h4 className="text-sm font-medium capitalize">
                {method} allocation
              </h4>
              <DataTable
                rows={weights[method]}
                getRowKey={(row) => row.symbol}
                columns={[
                  { key: "symbol", header: "Asset" },
                  { key: "weight", header: "Weight", align: "right", render: (row) => percent(row.weight) },
                ]}
              />
            </div>
          ))}
        </div>
      ) : null}
      <DataTable
        rows={data.assets}
        getRowKey={(asset) => asset.symbol}
        columns={[
          { key: "symbol", header: "Asset" },
          { key: "token_address", header: "Token", render: (asset) => <Address value={asset.token_address} /> },
          { key: "feed_address", header: "Chainlink feed", render: (asset) => <Address value={asset.feed_address} /> },
          { key: "rounds_read", header: "Rounds read", align: "right" },
          { key: "rounds", header: "Round IDs", render: (asset) => <span className="break-all font-mono">{asset.first_round_id} to {asset.last_round_id}</span> },
        ]}
      />
      {provenance ? (
        <div className="space-y-1 text-xs text-subtle">
          <p>
            Every daily price is recorded with its Chainlink round (
            {provenance.bundle.oracle_refs.length} observations).
          </p>
          <a
            className="text-sm text-foreground underline"
            download="price-provenance.json"
            href={`/api/finance/${encodeURIComponent(provenance.bundle.workflow_run_id)}?download=provenance`}
          >
            Download recorded inputs and provenance
          </a>
          <p className="break-all">Provenance hash: {provenance.bundle_hash}</p>
        </div>
      ) : null}
    </section>
  );
}
