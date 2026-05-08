import { Layers, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function FinanceStatesPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0a2e0e]">
          <Layers className="h-5 w-5 text-[#a8d8c4]" />
        </div>
        <div>
          <h1 className="text-2xl font-normal text-foreground">Quantum States</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Quantum state representations of portfolio positions.</p>
        </div>
      </div>
      <Card className="border-hairline bg-surface-soft">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0a2e0e]">
            <Layers className="h-8 w-8 text-[#a8d8c4]" />
          </div>
          <div className="text-center">
            <p className="font-medium text-foreground">Quantum state visualization</p>
            <p className="mt-1 text-sm text-muted-foreground">Bloch sphere and probability amplitude overlays per position.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-hairline bg-white px-3 py-1.5">
            <Clock className="h-3 w-3 text-muted-foreground" /><span className="text-xs text-muted-foreground">Coming in a future milestone</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
