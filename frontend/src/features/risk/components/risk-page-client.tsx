"use client";

import { RiskUploadPanel } from "./risk-upload-panel";

export function RiskPageClient() {
  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-2xl font-normal text-foreground">Risk Analysis</h1>
      <p className="mt-2 mb-6 text-sm text-muted-foreground">
        Upload a portfolio CSV to compute quantum VaR and CVaR with quadratic
        speedup over classical Monte Carlo.
      </p>
      <RiskUploadPanel />
    </div>
  );
}
