import { GitFork, Clock } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Panel, PanelContent } from "@/shared/components/panel/panel";

export default function DagPage() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={GitFork}
        title="DAG View"
        description="Network dependency graph across peers and services."
      />
      <div className="flex-1 overflow-y-auto p-6">
        <Panel className="border-border bg-surface-muted">
          <PanelContent className="flex flex-col items-center justify-center gap-4 py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-muted ring-1 ring-border">
              <GitFork className="h-7 w-7 text-subtle" />
            </div>
            <div className="text-center">
              <p className="font-medium text-foreground">DAG visualization</p>
              <p className="mt-1 text-sm text-faint">
                ReactFlow force-directed graph, arriving in Milestone 9.
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
