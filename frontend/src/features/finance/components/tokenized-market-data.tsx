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
    <section className="space-y-3 rounded border border-hairline p-4">
      <h3 className="text-base font-medium">Tokenized-stock data</h3>
      {result.disclaimer ? (
        <p role="note" className="text-sm font-medium text-foreground">
          {result.disclaimer}
        </p>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Source</dt>
        <dd>{data.source}</dd>
        <dt className="text-muted-foreground">Read at</dt>
        <dd>
          {data.block_timestamp} (block {data.block_number})
        </dd>
        <dt className="text-muted-foreground">Prices</dt>
        <dd>
          {data.aligned_days} daily token prices, {data.first_date} to{" "}
          {data.last_date} (requested {data.requested_start} to{" "}
          {data.requested_end})
        </dd>
        <dt className="text-muted-foreground">Sampling</dt>
        <dd>{data.sampling}</dd>
      </dl>
      {weights ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {(["classical", "quantum"] as const).map((method) => (
            <div key={method}>
              <h4 className="text-sm font-medium capitalize">
                {method} allocation
              </h4>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {weights[method].map((row) => (
                    <tr key={row.symbol}>
                      <td>{row.symbol}</td>
                      <td>{percent(row.weight)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : null}
      <table className="w-full border-separate border-spacing-x-3 text-left text-xs">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Token</th>
            <th>Chainlink feed</th>
            <th>Rounds read</th>
            <th>Round IDs</th>
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          {data.assets.map((asset) => (
            <tr key={asset.symbol}>
              <td className="text-foreground">{asset.symbol}</td>
              <td>
                <Address value={asset.token_address} />
              </td>
              <td>
                <Address value={asset.feed_address} />
              </td>
              <td>{asset.rounds_read}</td>
              <td className="break-all font-mono">
                {asset.first_round_id} to {asset.last_round_id}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {provenance ? (
        <div className="space-y-1 text-xs text-muted-foreground">
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
