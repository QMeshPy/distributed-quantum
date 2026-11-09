"use client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
    return <Skeleton className="h-48 w-full" />;
  }

  if (!data) {
    return (
      <Card className="border-hairline">
        <CardContent className="flex h-48 items-center justify-center">
          <p className="text-sm text-muted-foreground">No fidelity data available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-hairline">
      <CardHeader className="pb-2 pt-5">
        <h3 className="text-sm font-medium text-foreground">Fidelity Metrics</h3>
        <p className="text-xs text-muted-foreground font-mono">{nodeId.slice(0, 24)}…</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-normal tabular-nums text-foreground">
              {(data.averageFidelity * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">Average</p>
          </div>
          <div>
            <p className="text-2xl font-normal tabular-nums text-foreground">
              {(data.minFidelity * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">Minimum</p>
          </div>
          <div>
            <p className="text-2xl font-normal tabular-nums text-foreground">
              {(data.maxFidelity * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">Maximum</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {data.sampleCount} samples · Interactive chart in M9 (recharts, dynamic import)
        </p>
      </CardContent>
    </Card>
  );
}
