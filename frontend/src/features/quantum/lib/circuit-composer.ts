import type { CircuitLayer, Gate } from "../types";

/**
 * Converts a circuit (array of layers) into an OpenQASM 2.0 string.
 */
export function composeCircuit(layers: CircuitLayer[]): string {
  if (layers.length === 0) {
    return "OPENQASM 2.0;\ninclude \"qelib1.inc\";\n";
  }

  // Determine total qubit count from all gates
  let maxQubit = 0;
  for (const layer of layers) {
    for (const gate of layer.gates) {
      if (gate.qubit > maxQubit) maxQubit = gate.qubit;
      if (gate.controlQubit !== undefined && gate.controlQubit > maxQubit) {
        maxQubit = gate.controlQubit;
      }
      if (gate.targetQubit !== undefined && gate.targetQubit > maxQubit) {
        maxQubit = gate.targetQubit;
      }
    }
  }
  const numQubits = maxQubit + 1;

  const lines: string[] = [
    `OPENQASM 2.0;`,
    `include "qelib1.inc";`,
    `qreg q[${numQubits}];`,
    `creg c[${numQubits}];`,
    "",
  ];

  for (const layer of layers) {
    for (const gate of layer.gates) {
      const gateStr = gateToQasm(gate);
      if (gateStr) lines.push(gateStr);
    }
  }

  lines.push("");
  lines.push(`measure q -> c;`);

  return lines.join("\n");
}

function gateToQasm(gate: Gate): string {
  const q = gate.qubit;
  const ctrl = gate.controlQubit;
  const tgt2 = gate.targetQubit;
  const p = gate.parameter;

  switch (gate.type) {
    case "H":
      return `h q[${q}];`;
    case "X":
      return `x q[${q}];`;
    case "Y":
      return `y q[${q}];`;
    case "Z":
      return `z q[${q}];`;
    case "T":
      return `t q[${q}];`;
    case "S":
      return `s q[${q}];`;
    case "RX":
      return `rx(${(p ?? 0).toFixed(6)}) q[${q}];`;
    case "RY":
      return `ry(${(p ?? 0).toFixed(6)}) q[${q}];`;
    case "RZ":
      return `rz(${(p ?? 0).toFixed(6)}) q[${q}];`;
    case "CNOT":
      if (ctrl === undefined) return "";
      return `cx q[${ctrl}],q[${q}];`;
    case "Toffoli":
      if (ctrl === undefined || tgt2 === undefined) return "";
      return `ccx q[${ctrl}],q[${tgt2}],q[${q}];`;
    default:
      return "";
  }
}

/**
 * Validates a circuit for structural correctness.
 */
export function validateCircuit(
  layers: CircuitLayer[],
  numQubits: number,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const usedQubits = new Set<number>();

    for (const gate of layer.gates) {
      if (gate.qubit < 0 || gate.qubit >= numQubits) {
        errors.push(
          `Layer ${li + 1}: gate "${gate.type}" targets out-of-range qubit ${gate.qubit}.`,
        );
      }

      if (usedQubits.has(gate.qubit)) {
        errors.push(
          `Layer ${li + 1}: qubit ${gate.qubit} is used by more than one gate.`,
        );
      }
      usedQubits.add(gate.qubit);

      if (gate.controlQubit !== undefined) {
        if (gate.controlQubit < 0 || gate.controlQubit >= numQubits) {
          errors.push(
            `Layer ${li + 1}: gate "${gate.type}" control qubit ${gate.controlQubit} is out of range.`,
          );
        }
        if (gate.controlQubit === gate.qubit) {
          errors.push(
            `Layer ${li + 1}: gate "${gate.type}" control and target are the same qubit (${gate.qubit}).`,
          );
        }
        usedQubits.add(gate.controlQubit);
      }

      if (gate.type === "Toffoli" && gate.targetQubit !== undefined) {
        if (gate.targetQubit < 0 || gate.targetQubit >= numQubits) {
          errors.push(
            `Layer ${li + 1}: Toffoli second control qubit ${gate.targetQubit} is out of range.`,
          );
        }
        usedQubits.add(gate.targetQubit);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Returns the circuit depth (number of non-empty layers).
 */
export function estimateDepth(layers: CircuitLayer[]): number {
  return layers.filter((l) => l.gates.length > 0).length;
}
