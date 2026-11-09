import { Spline, Clock } from "lucide-react";
import { Panel, PanelContent } from "@/shared/components/panel/panel";

export default function FinanceFrontierPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info">
          <Spline className="h-5 w-5 text-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-normal text-foreground">Efficient Frontier</h1>
          <p className="mt-0.5 text-sm text-subtle">Quantum-computed efficient frontier and portfolio optimization.</p>
        </div>
      </div>
      <Panel className="border-border-subtle bg-surface-muted">
        <PanelContent className="flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-info">
            <Spline className="h-8 w-8 text-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium text-foreground">Efficient frontier visualization</p>
            <p className="mt-1 text-sm text-subtle">Risk–return curve computed via quantum amplitude estimation.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border-subtle bg-surface px-3 py-1.5">
            <Clock className="h-3 w-3 text-subtle" /><span className="text-xs text-subtle">Coming in a future milestone</span>
          </div>
        </PanelContent>
      </Panel>
    </div>
  );
}
