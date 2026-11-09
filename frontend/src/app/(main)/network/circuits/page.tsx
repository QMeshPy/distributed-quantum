import { Route, Clock } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Panel, PanelContent } from "@/shared/components/panel/panel";

export default function CircuitsPage() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={Route}
        title="Circuits"
        description="Active circuit routes across the network."
      />
      <div className="flex-1 overflow-y-auto p-6">
        <Panel className="border-border bg-surface-muted">
          <PanelContent className="flex flex-col items-center justify-center gap-4 py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-muted ring-1 ring-border">
              <Route className="h-7 w-7 text-subtle" />
            </div>
            <div className="text-center">
              <p className="font-medium text-foreground">Circuit path viewer</p>
              <p className="mt-1 text-sm text-faint">
                Visualizes entanglement routing paths between peers.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-surface-muted px-3 py-1.5 ring-1 ring-border">
              <Clock className="h-3 w-3 text-subtle" />
              <span className="text-xs text-subtle">Milestone 9</span>
            </div>
          </PanelContent>
        </Panel>
      </div>
    </div>
  );
}
