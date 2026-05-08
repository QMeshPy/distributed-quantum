"use client";

// This component is heavy and MUST be wrapped with next/dynamic({ ssr: false }) in its parent.
// Example usage in a parent component:
//   const VisualCircuitBuilder = dynamic(
//     () => import("@/features/quantum/components/visual-circuit-builder"),
//     { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
//   );

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GatePalette } from "./gate-palette";
import { CircuitOutputPanel } from "./circuit-output-panel";
import { useCircuitComposer } from "../hooks/use-circuit-composer";
import { getGateDisplay } from "../lib/visual-circuit";
import type { GateType } from "../types";

interface VisualCircuitBuilderProps {
  onCircuitChange?: (qasmCode: string) => void;
  initialQasm?: string;
  className?: string;
}

export function VisualCircuitBuilder({
  onCircuitChange,
  className,
}: VisualCircuitBuilderProps) {
  const [selectedGate, setSelectedGate] = useState<GateType>("H");
  const [showOutput, setShowOutput] = useState(false);

  const {
    layers,
    numQubits,
    qasmOutput,
    depth,
    setNumQubits,
    addGate,
    removeGate,
    clearCircuit,
    addLayer,
  } = useCircuitComposer(2);

  const handleCellClick = useCallback(
    (layerIndex: number, qubitIndex: number) => {
      addGate(layerIndex, qubitIndex, selectedGate);
      onCircuitChange?.(qasmOutput);
    },
    [selectedGate, addGate, onCircuitChange, qasmOutput],
  );

  const handleGateRemove = useCallback(
    (layerIndex: number, gateId: string) => {
      removeGate(layerIndex, gateId);
    },
    [removeGate],
  );

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Qubits:</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0 text-xs"
            onClick={() => setNumQubits(numQubits - 1)}
            disabled={numQubits <= 1}
          >
            −
          </Button>
          <span className="min-w-[1.5rem] text-center text-sm font-mono">
            {numQubits}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0 text-xs"
            onClick={() => setNumQubits(numQubits + 1)}
            disabled={numQubits >= 10}
          >
            +
          </Button>
          <span className="ml-2 text-xs text-muted-foreground">
            Depth: {depth}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setShowOutput((v) => !v); }}
          >
            {showOutput ? "Hide" : "Show"} QASM
          </Button>
          <Button variant="outline" size="sm" onClick={addLayer}>
            + Layer
          </Button>
          <Button variant="outline" size="sm" onClick={clearCircuit}>
            Clear
          </Button>
        </div>
      </div>

      {/* Gate palette + circuit grid */}
      <div className="flex gap-4">
        {/* Gate palette */}
        <div className="w-36 shrink-0 rounded-md border border-border bg-card p-3">
          <GatePalette
            onSelectGate={setSelectedGate}
            selectedGate={selectedGate}
          />
        </div>

        {/* Circuit grid */}
        <div className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-card p-3">
          <div className="flex flex-col gap-0.5">
            {/* Column headers (layer indices) */}
            <div className="flex">
              <div className="w-10 shrink-0" />
              {layers.map((_, li) => (
                <div
                  key={li}
                  className="flex w-12 shrink-0 items-center justify-center"
                >
                  <span className="text-[10px] text-muted-foreground">{li + 1}</span>
                </div>
              ))}
            </div>

            {/* Rows */}
            {Array.from({ length: numQubits }, (_, qi) => (
              <div key={qi} className="flex items-center gap-0">
                {/* Row label */}
                <div className="flex w-10 shrink-0 items-center justify-end pr-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    q{qi}
                  </span>
                </div>

                {/* Wire + cells */}
                {layers.map((layer, li) => {
                  const gate = layer.gates.find((g) => g.qubit === qi);
                  const display = gate ? getGateDisplay(gate) : null;
                  return (
                    <div
                      key={li}
                      className="relative flex w-12 shrink-0 items-center"
                    >
                      {/* Horizontal wire */}
                      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />

                      {/* Gate cell */}
                      <button
                        type="button"
                        className={cn(
                          "relative z-10 mx-auto flex h-9 w-9 items-center justify-center rounded border text-xs font-mono transition-colors",
                          gate
                            ? cn(
                                "border-transparent text-white shadow-sm",
                                display?.color,
                              )
                            : "border-dashed border-border bg-background text-muted-foreground opacity-0 hover:opacity-100",
                        )}
                        onClick={() =>
                          gate
                            ? handleGateRemove(li, gate.id)
                            : handleCellClick(li, qi)
                        }
                        title={gate ? `Remove ${gate.type}` : `Place ${selectedGate}`}
                      >
                        {display?.label ?? ""}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* QASM output panel */}
      {showOutput && (
        <CircuitOutputPanel qasmCode={qasmOutput} />
      )}
    </div>
  );
}
