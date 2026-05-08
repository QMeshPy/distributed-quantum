// Public barrel for the quantum feature
// Heavy components (BlochSphere, VisualCircuitBuilder) MUST be imported via next/dynamic in consumers.

export { BlochSphere } from "./components/bloch-sphere";
export { GatePalette } from "./components/gate-palette";
export { CircuitOutputPanel } from "./components/circuit-output-panel";
export { VisualCircuitBuilder } from "./components/visual-circuit-builder";

// Hooks
export { useCircuitComposer } from "./hooks/use-circuit-composer";

// Lib
export { composeCircuit, validateCircuit, estimateDepth } from "./lib/circuit-composer";
export { getGateDisplay, computeGridLayout } from "./lib/visual-circuit";

// Types
export type {
  GateType,
  Gate,
  CircuitLayer,
  BlochVector,
  QubitState,
  CircuitResult,
  GridCell,
} from "./types";
