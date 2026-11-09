import { OracleEvidence } from "@/shared/components/oracle-evidence";
import type { FinanceResult } from "../types";

export function PortfolioValuation({ result }: { result: FinanceResult }) {
  if (!result.valuation) return null;
  return (
    <section className="space-y-3 rounded border border-hairline p-4">
      <h3 className="text-base font-medium">Quantities at recorded prices</h3>
      <p className="text-sm text-muted-foreground">
        Investment: ${result.valuation.investment_usd}. Historical data
        determines selection. Sepolia testnet prices are illustrative, not
        execution quotes.
      </p>
      {(["classical", "quantum"] as const).map((method) => (
        <div key={method}>
          <h4 className="text-sm font-medium capitalize">
            {method} allocation
          </h4>
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Allocation (USD)</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              {result.valuation!.allocations[method].map((row) => (
                <tr key={row.ticker}>
                  <td>{row.ticker}</td>
                  <td>{Number(row.allocation_usd).toFixed(2)}</td>
                  <td>
                    {row.status === "valued"
                      ? Number(row.quantity).toPrecision(8)
                      : "No supported feed"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <OracleEvidence provenance={result.provenance} />
    </section>
  );
}
