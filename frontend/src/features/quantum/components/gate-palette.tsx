"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GateType } from "../types";

interface GatePaletteProps {
  onSelectGate: (gateType: GateType) => void;
  selectedGate?: GateType;
}

interface GateCategory {
  label: string;
  gates: GateType[];
}

const GATE_CATEGORIES: GateCategory[] = [
  { label: "Clifford", gates: ["H", "X", "Y", "Z", "S"] },
  { label: "Phase", gates: ["T", "RX", "RY", "RZ"] },
  { label: "Multi-qubit", gates: ["CNOT", "Toffoli"] },
];

const GATE_LABELS: Record<GateType, string> = {
  H: "H",
  X: "X",
  Y: "Y",
  Z: "Z",
  S: "S",
  T: "T",
  RX: "Rₓ",
  RY: "Rᵧ",
  RZ: "R_z",
  CNOT: "CX",
  Toffoli: "CCX",
};

export function GatePalette({ onSelectGate, selectedGate }: GatePaletteProps) {
  return (
    <div className="flex flex-col gap-3">
      {GATE_CATEGORIES.map((category) => (
        <div key={category.label}>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {category.label}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {category.gates.map((gateType) => (
              <Button
                key={gateType}
                variant={selectedGate === gateType ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-8 w-12 p-0 text-xs font-mono",
                  selectedGate === gateType &&
                    "bg-primary text-primary-foreground",
                )}
                onClick={() => onSelectGate(gateType)}
              >
                {GATE_LABELS[gateType]}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
