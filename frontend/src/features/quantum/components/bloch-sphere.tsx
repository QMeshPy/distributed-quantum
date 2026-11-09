"use client";

import type { QubitState } from "../types";
import { cn } from "@/lib/utils";

// TODO: Replace with Three.js BlochSphere when @qctrl/visualizer or three.js is confirmed
// This component MUST be wrapped with next/dynamic({ ssr: false }) in its parent.

interface BlochSphereProps {
  qubitState?: QubitState;
  className?: string;
}

const SPHERE_R = 80;
const CX = 100;
const CY = 100;
const AXIS_LEN = 72;

function polarToXyz(theta: number, phi: number) {
  const sinT = Math.sin(theta);
  return {
    x: sinT * Math.cos(phi),
    y: sinT * Math.sin(phi),
    z: Math.cos(theta),
  };
}

function projectToSvg(x: number, y: number, z: number) {
  // Orthographic: x → right, z → up, y → depth (ignored in 2D)
  return {
    sx: CX + AXIS_LEN * x,
    sy: CY - AXIS_LEN * z,
  };
}

export function BlochSphere({ qubitState, className }: BlochSphereProps) {
  const theta = qubitState?.blochVector.theta ?? 0;
  const phi = qubitState?.blochVector.phi ?? 0;
  const vec = polarToXyz(theta, phi);
  const { sx: vx, sy: vy } = projectToSvg(vec.x, vec.y, vec.z);

  const pZero = qubitState?.probabilities.zero ?? 1;
  const pOne = qubitState?.probabilities.one ?? 0;

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-4",
        className,
      )}
    >
      <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
        Qubit {qubitState?.qubitIndex ?? 0} — Bloch Sphere
      </p>

      <svg
        width="200"
        height="200"
        viewBox="0 0 200 200"
        aria-label="Bloch sphere placeholder"
        className="shrink-0"
      >
        {/* Sphere outline */}
        <circle
          cx={CX}
          cy={CY}
          r={SPHERE_R}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="1.5"
        />
        {/* Equator ellipse */}
        <ellipse
          cx={CX}
          cy={CY}
          rx={SPHERE_R}
          ry={SPHERE_R * 0.25}
          fill="none"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth="1"
          strokeDasharray="4 3"
          opacity={0.5}
        />

        {/* Z axis (vertical) */}
        <line
          x1={CX}
          y1={CY - AXIS_LEN - 10}
          x2={CX}
          y2={CY + AXIS_LEN + 10}
          stroke="hsl(var(--muted-foreground))"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity={0.6}
        />
        {/* X axis (horizontal) */}
        <line
          x1={CX - AXIS_LEN - 10}
          y1={CY}
          x2={CX + AXIS_LEN + 10}
          y2={CY}
          stroke="hsl(var(--muted-foreground))"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity={0.6}
        />

        {/* Axis labels */}
        <text
          x={CX}
          y={CY - AXIS_LEN - 14}
          textAnchor="middle"
          fontSize="11"
          fill="hsl(var(--muted-foreground))"
        >
          |0⟩
        </text>
        <text
          x={CX}
          y={CY + AXIS_LEN + 22}
          textAnchor="middle"
          fontSize="11"
          fill="hsl(var(--muted-foreground))"
        >
          |1⟩
        </text>
        <text
          x={CX + AXIS_LEN + 14}
          y={CY + 4}
          textAnchor="start"
          fontSize="11"
          fill="hsl(var(--muted-foreground))"
        >
          X
        </text>
        <text
          x={CX - AXIS_LEN - 14}
          y={CY + 4}
          textAnchor="end"
          fontSize="11"
          fill="hsl(var(--muted-foreground))"
        >
          Y
        </text>

        {/* State vector */}
        <line
          x1={CX}
          y1={CY}
          x2={vx}
          y2={vy}
          stroke="hsl(var(--primary))"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* State vector tip */}
        <circle
          cx={vx}
          cy={vy}
          r="5"
          fill="hsl(var(--primary))"
        />
      </svg>

      {/* Probability readout */}
      <div className="w-full space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>|0⟩</span>
          <span>{(pZero * 100).toFixed(1)}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${pZero * 100}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>|1⟩</span>
          <span>{(pOne * 100).toFixed(1)}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-[hsl(var(--chart-2))] transition-all duration-300"
            style={{ width: `${pOne * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
