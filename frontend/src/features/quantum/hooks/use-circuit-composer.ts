"use client";

import { useState, useCallback, useMemo } from "react";
import type { CircuitLayer, Gate, GateType } from "../types";
import { composeCircuit, estimateDepth } from "../lib/circuit-composer";

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

interface UseCircuitComposerReturn {
  layers: CircuitLayer[];
  numQubits: number;
  qasmOutput: string;
  depth: number;
  setNumQubits: (n: number) => void;
  addGate: (
    layerIndex: number,
    qubit: number,
    type: GateType,
    options?: { controlQubit?: number; parameter?: number },
  ) => void;
  removeGate: (layerIndex: number, gateId: string) => void;
  clearCircuit: () => void;
  addLayer: () => void;
}

export function useCircuitComposer(
  initialQubits = 2,
): UseCircuitComposerReturn {
  const [numQubits, setNumQubits] = useState(
    () => Math.max(1, Math.min(initialQubits, 10)),
  );
  const [layers, setLayers] = useState<CircuitLayer[]>(() => [
    { id: generateId(), gates: [] },
    { id: generateId(), gates: [] },
    { id: generateId(), gates: [] },
  ]);

  const qasmOutput = useMemo(() => composeCircuit(layers), [layers]);
  const depth = useMemo(() => estimateDepth(layers), [layers]);

  const addGate = useCallback(
    (
      layerIndex: number,
      qubit: number,
      type: GateType,
      options?: { controlQubit?: number; parameter?: number },
    ) => {
      setLayers((prev) => {
        const next = prev.map((layer, i) => {
          if (i !== layerIndex) return layer;
          // Remove any existing gate on this qubit in this layer
          const filtered = layer.gates.filter((g) => g.qubit !== qubit);
          const newGate: Gate = {
            id: generateId(),
            type,
            qubit,
            ...(options?.controlQubit !== undefined && {
              controlQubit: options.controlQubit,
            }),
            ...(options?.parameter !== undefined && {
              parameter: options.parameter,
            }),
          };
          return { ...layer, gates: [...filtered, newGate] };
        });
        return next;
      });
    },
    [],
  );

  const removeGate = useCallback((layerIndex: number, gateId: string) => {
    setLayers((prev) =>
      prev.map((layer, i) => {
        if (i !== layerIndex) return layer;
        return { ...layer, gates: layer.gates.filter((g) => g.id !== gateId) };
      }),
    );
  }, []);

  const clearCircuit = useCallback(() => {
    setLayers([
      { id: generateId(), gates: [] },
      { id: generateId(), gates: [] },
      { id: generateId(), gates: [] },
    ]);
  }, []);

  const addLayer = useCallback(() => {
    setLayers((prev) => [...prev, { id: generateId(), gates: [] }]);
  }, []);

  return {
    layers,
    numQubits,
    qasmOutput,
    depth,
    setNumQubits: (n: number) => setNumQubits(Math.max(1, Math.min(n, 10))),
    addGate,
    removeGate,
    clearCircuit,
    addLayer,
  };
}
