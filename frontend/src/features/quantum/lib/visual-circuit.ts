import type { Gate, GateType, CircuitLayer, GridCell } from "../types";

interface GateDisplay {
  label: string;
  color: string; // Tailwind bg class using CSS variables
}

const GATE_DISPLAY: Record<GateType, GateDisplay> = {
  H: { label: "H", color: "bg-[hsl(var(--chart-1))]" },
  X: { label: "X", color: "bg-[hsl(var(--chart-2))]" },
  Y: { label: "Y", color: "bg-[hsl(var(--chart-3))]" },
  Z: { label: "Z", color: "bg-[hsl(var(--chart-4))]" },
  T: { label: "T", color: "bg-[hsl(var(--chart-5))]" },
  S: { label: "S", color: "bg-[hsl(var(--chart-1))]" },
  CNOT: { label: "CX", color: "bg-[hsl(var(--chart-2))]" },
  RX: { label: "RX", color: "bg-[hsl(var(--chart-3))]" },
  RY: { label: "RY", color: "bg-[hsl(var(--chart-3))]" },
  RZ: { label: "RZ", color: "bg-[hsl(var(--chart-4))]" },
  Toffoli: { label: "CCX", color: "bg-[hsl(var(--chart-5))]" },
};

/**
 * Returns display properties (label and color class) for a gate.
 */
export function getGateDisplay(gate: Gate): GateDisplay {
  return GATE_DISPLAY[gate.type] ?? { label: gate.type, color: "bg-muted" };
}

/**
 * Builds a 2D grid (rows = qubits, cols = layers) of GridCell objects.
 * Each cell is either empty or contains a gate.
 */
export function computeGridLayout(
  layers: CircuitLayer[],
  numQubits: number,
): GridCell[][] {
  // grid[qubitIndex][layerIndex]
  const grid: GridCell[][] = Array.from({ length: numQubits }, (_, qubitIndex) =>
    Array.from({ length: layers.length }, (__, layerIndex) => ({
      layerIndex,
      qubitIndex,
      gate: null,
    })),
  );

  for (let li = 0; li < layers.length; li++) {
    for (const gate of layers[li].gates) {
      const q = gate.qubit;
      if (q >= 0 && q < numQubits && grid[q]?.[li]) {
        grid[q][li] = { layerIndex: li, qubitIndex: q, gate };
      }
    }
  }

  return grid;
}
