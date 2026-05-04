import { NodeTable } from "@/features/network/components/node-table";

export default function NodesPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-normal text-foreground">Nodes</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          All discovered peers — status, trust tier, and execution load.
        </p>
      </div>
      <NodeTable />
    </div>
  );
}
