"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  smiles: string;
  width?: number;
  height?: number;
  className?: string;
}

// Injected into the SVG so bonds/atoms read on dark backgrounds whatever openchemlib emits.
// Scoped to .ocl-ligand: an inline <style> applies document-wide and would recolour charts.
const DARK_THEME_STYLE = `
  <style>
    .ocl-ligand rect, .ocl-ligand polygon { fill: transparent !important; }
    .ocl-ligand path, .ocl-ligand line { stroke: rgba(255,255,255,0.82) !important; fill: none !important; }
    .ocl-ligand path[fill]:not([fill="none"]) { fill: rgba(255,255,255,0.82) !important; }
    .ocl-ligand ellipse, .ocl-ligand circle { stroke: rgba(255,255,255,0.82) !important; }
    .ocl-ligand text, .ocl-ligand tspan { fill: rgba(255,255,255,0.82) !important; stroke: none !important; }
  </style>
`;

/** Chrome-less 2D structure drawing; the parent supplies the frame and label. */
export function LigandViewer({ smiles, width = 260, height = 180, className = "" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!smiles || !containerRef.current) return;
    let cancelled = false;
    setState("loading");
    import("openchemlib")
      .then((OCL) => {
        if (cancelled || !containerRef.current) return;
        const svg = OCL.Molecule.fromSmiles(smiles).toSVG(width, height, undefined, {
          autoCrop: true,
          autoCropMargin: 12,
          suppressChiralText: true,
          noStereoProblem: true,
        });
        containerRef.current.innerHTML = svg.replace(/(<svg[^>]*>)/, `$1${DARK_THEME_STYLE}`);
        setState("ready");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [smiles, width, height]);

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ minHeight: height }}
      role="img"
      aria-label={`2D structure of ${smiles}`}
    >
      {state === "loading" && <Loader2 size={16} className="animate-spin text-white/25" />}
      {state === "error" && <p className="text-[11px] text-white/30">Structure unavailable</p>}
      <div
        ref={containerRef}
        className={state === "ready" ? "ocl-ligand [&_svg]:h-auto [&_svg]:max-w-full" : "hidden"}
      />
    </div>
  );
}
