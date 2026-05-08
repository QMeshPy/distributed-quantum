import { Server } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { NodeTable } from "@/features/network/components/node-table";

export default function NodesPage() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={Server}
        label="Network"
        title="Nodes" glow="blue"
        description="All discovered peers — status, trust tier, and execution load."
      />
      <div className="flex-1 overflow-y-auto p-6">
        <NodeTable />
      </div>
    </div>
  );
}
