"use client";

import type { CircuitResult } from "../types";

interface CircuitOutputPanelProps {
  qasmCode: string;
  result?: CircuitResult;
}

export function CircuitOutputPanel({ qasmCode, result }: CircuitOutputPanelProps) {
  const totalShots = result?.totalShots ?? 0;
  const measurements = result?.measurements ?? {};
  const sortedEntries = Object.entries(measurements).toSorted(
    ([, a], [, b]) => b - a,
  );

  const maxCount = sortedEntries.length > 0 ? (sortedEntries[0][1] ?? 1) : 1;

  return (
    <div className="flex flex-col gap-4">
      {/* QASM Output */}
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          QASM Output
        </p>
        <pre className="w-full overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground">
          {qasmCode || "// No circuit defined"}
        </pre>
      </div>

      {/* Measurement Results */}
      {result && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Measurement Results ({totalShots.toLocaleString()} shots)
          </p>
          {sortedEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No measurements yet.</p>
          ) : (
            <div className="space-y-2">
              {sortedEntries.map(([bitstring, count]) => {
                const pct = totalShots > 0 ? (count / totalShots) * 100 : 0;
                const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0;
                return (
                  <div key={bitstring} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 font-mono text-xs text-foreground">
                      {bitstring}
                    </span>
                    <div className="flex-1 h-4 rounded-sm bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-sm bg-primary transition-all duration-300"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                      {count.toLocaleString()} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
