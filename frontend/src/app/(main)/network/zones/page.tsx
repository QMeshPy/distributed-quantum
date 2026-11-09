import { MapPin } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { NodeTable } from "@/features/network/components/node-table";

export default function ZonesPage() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={MapPin}
        label="Network"
        title="Zones" glow="violet"
        description="Logical zone groupings — peers organized by trust tier."
      />
      <div className="flex-1 overflow-y-auto p-6">
        <NodeTable />
      </div>
    </div>
  );
}
