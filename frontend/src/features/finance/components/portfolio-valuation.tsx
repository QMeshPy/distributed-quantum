import { DataTable } from "@/shared/components/detail/data-table";
import { OracleEvidence } from "@/shared/components/oracle-evidence";
import type { FinanceResult } from "../types";

export function PortfolioValuation({ result }: { result: FinanceResult }) {
  if (!result.valuation) return null;
  return (
    <section className="space-y-3 rounded border border-border-subtle p-4">
      <h3 className="text-base font-medium">Quantities at recorded prices</h3>
      <p className="text-sm text-subtle">
        Investment: ${result.valuation.investment_usd}. Historical data
        determines selection. Sepolia testnet prices are illustrative, not
        execution quotes.
      </p>
      {(["classical", "quantum"] as const).map((method) => (
        <div key={method}>
          <h4 className="text-sm font-medium capitalize">
            {method} allocation
          </h4>
          <DataTable
            rows={result.valuation!.allocations[method]}
            getRowKey={(row) => row.ticker}
            columns={[
              { key: "ticker", header: "Asset" },
              { key: "allocation_usd", header: "Allocation (USD)", align: "right", render: (row) => Number(row.allocation_usd).toFixed(2) },
              { key: "quantity", header: "Quantity", align: "right", render: (row) => (row.status === "valued" ? Number(row.quantity).toPrecision(8) : "No supported feed") },
            ]}
          />
        </div>
      ))}
      <OracleEvidence provenance={result.provenance} />
    </section>
  );
}
