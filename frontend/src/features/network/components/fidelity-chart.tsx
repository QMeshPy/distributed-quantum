"use client";
import { Panel, PanelContent, PanelHeader } from "@/shared/components/panel/panel";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { useNetworkFidelity } from "../hooks/use-network-fidelity";

interface FidelityChartProps {
  nodeId: string;
}

/**
 * Placeholder for fidelity trend chart.
 * Full recharts implementation added in M9 (dynamic import, ssr: false).
 */
export function FidelityChart({ nodeId }: FidelityChartProps) {
  const { data, isLoading } = useNetworkFidelity(nodeId);

  if (isLoading) {
    return <Skeleton lines={6} className="h-48 w-full" />;
  }

  if (!data) {
    return (
      <Panel className="border-border-subtle">
        <PanelContent className="flex h-48 items-center justify-center">
          <p className="text-sm text-subtle">No fidelity data available.</p>
        </PanelContent>
      </Panel>
    );
  }

  return (
    <Panel className="border-border-subtle">
      <PanelHeader className="pb-2 pt-5">
        <h3 className="text-sm font-medium text-foreground">Fidelity Metrics</h3>
        <p className="text-xs text-subtle font-mono">{nodeId.slice(0, 24)}…</p>
      </PanelHeader>
      <PanelContent>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-normal tabular-nums text-foreground">
              {(data.averageFidelity * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-subtle">Average</p>
          </div>
          <div>
            <p className="text-2xl font-normal tabular-nums text-foreground">
              {(data.minFidelity * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-subtle">Minimum</p>
          </div>
          <div>
            <p className="text-2xl font-normal tabular-nums text-foreground">
              {(data.maxFidelity * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-subtle">Maximum</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-subtle">
          {data.sampleCount} samples · Interactive chart in M9 (recharts, dynamic import)
        </p>
      </PanelContent>
    </Panel>
  );
}
