import { Layers } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { ServiceTable } from "@/features/network/components/service-table";

export default function ServicesPage() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={Layers}
        label="Network"
        title="Services" glow="emerald"
        description="Registered quantum services — type, fidelity, and qubit ranges."
      />
      <div className="flex-1 overflow-y-auto p-6">
        <ServiceTable />
      </div>
    </div>
  );
}
