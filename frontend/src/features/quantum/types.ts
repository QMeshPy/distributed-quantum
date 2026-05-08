export type GateType =
  | "H"
  | "X"
  | "Y"
  | "Z"
  | "CNOT"
  | "T"
  | "S"
  | "RX"
  | "RY"
  | "RZ"
  | "Toffoli";

export interface Gate {
  id: string;
  type: GateType;
  qubit: number;
  controlQubit?: number; // for CNOT, Toffoli
  targetQubit?: number; // second target for Toffoli
  parameter?: number; // for RX, RY, RZ (radians)
}

export interface CircuitLayer {
  id: string;
  gates: Gate[];
}

export interface BlochVector {
  theta: number; // polar angle
  phi: number; // azimuthal angle
  x: number;
  y: number;
  z: number;
}

export interface QubitState {
  qubitIndex: number;
  blochVector: BlochVector;
  probabilities: { zero: number; one: number };
}

export interface CircuitResult {
  qubitStates: QubitState[];
  measurements: Record<string, number>; // bitstring -> count
  totalShots: number;
}

export interface GridCell {
  layerIndex: number;
  qubitIndex: number;
  gate: Gate | null;
}
