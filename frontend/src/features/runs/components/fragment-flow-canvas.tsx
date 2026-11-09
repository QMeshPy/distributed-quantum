"use client";
import { Panel, PanelContent } from "@/shared/components/panel/panel";
import type { RunDetail } from "../types";

export function FragmentFlowCanvas({ run }: { run: RunDetail }) {
  void run;
  return (
    <Panel className="border-border-subtle">
      <PanelContent className="flex h-64 items-center justify-center">
        <p className="text-sm text-subtle">
          Fragment flow visualization, coming soon
        </p>
      </PanelContent>
    </Panel>
  );
}
// NOTE: When ReactFlow is added, wrap with next/dynamic({ ssr: false })
