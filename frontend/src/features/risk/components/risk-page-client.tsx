"use client";

import { RiskUploadPanel } from "./risk-upload-panel";
import { WalletPortfolioPanel } from "./wallet-portfolio-panel";

export function RiskPageClient() {
  return (
    <div className="p-6 max-w-xl space-y-10">
      <div>
        <h1 className="text-2xl font-normal text-foreground">Risk Analysis</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Run quantum VaR and CVaR on a CSV portfolio or on read-only on-chain
          wallet holdings.
        </p>
      </div>
      <WalletPortfolioPanel />
      <RiskUploadPanel />
    </div>
  );
}
