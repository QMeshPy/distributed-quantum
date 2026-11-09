"use client";
import { Card, CardContent } from "@/components/ui/card";
import type { RunDetail } from "../types";

export function FragmentFlowCanvas({ run }: { run: RunDetail }) {
  void run;
  return (
    <Card className="border-hairline">
      <CardContent className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Fragment flow visualization — coming soon
        </p>
      </CardContent>
    </Card>
  );
}
// NOTE: When ReactFlow is added, wrap with next/dynamic({ ssr: false })
