import { Route, Clock } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function CircuitsPage() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={Route}
        label="Network"
        title="Circuits" glow="amber"
        description="Active circuit routes across the network."
      />
      <div className="flex-1 overflow-y-auto p-6">
        <Card className="border-white/6 bg-white/[0.03]">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
              <Route className="h-7 w-7 text-white/40" />
            </div>
            <div className="text-center">
              <p className="font-medium text-white/80">Circuit path viewer</p>
              <p className="mt-1 text-sm text-white/35">
                Visualizes entanglement routing paths between peers.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 ring-1 ring-white/10">
              <Clock className="h-3 w-3 text-white/40" />
              <span className="text-xs text-white/40">Milestone 9</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
