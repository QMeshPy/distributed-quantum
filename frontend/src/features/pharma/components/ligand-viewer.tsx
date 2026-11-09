"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Hexagon } from "lucide-react";

interface Props {
  smiles: string;
  label?: string;
  width?: number;
  height?: number;
}

// Injected into the SVG so bonds/atoms are visible on dark backgrounds
// regardless of whether openchemlib uses inline attrs or CSS style attributes
const DARK_THEME_STYLE = `
  <style>
    rect, polygon { fill: transparent !important; }
    path, line { stroke: rgba(255,255,255,0.80) !important; fill: none !important; }
    path[fill]:not([fill="none"]) { fill: rgba(255,255,255,0.80) !important; }
    ellipse, circle { stroke: rgba(255,255,255,0.80) !important; }
    text, tspan { fill: rgba(255,255,255,0.80) !important; stroke: none !important; }
  </style>
`;

export function LigandViewer({ smiles, label, width = 260, height = 180 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!smiles || !containerRef.current) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    import("openchemlib")
      .then((OCL) => {
        if (cancelled || !containerRef.current) return;
        try {
          const mol = OCL.Molecule.fromSmiles(smiles);

          const svgStr = mol.toSVG(width, height, undefined, {
            autoCrop: true,
            autoCropMargin: 12,
            suppressChiralText: true,
            noStereoProblem: true,
          });

          // Inject the dark-theme style block right after the opening <svg tag
          const patched = svgStr.replace(/(<svg[^>]*>)/, `$1${DARK_THEME_STYLE}`);

          containerRef.current.innerHTML = patched;
          setLoading(false);
        } catch {
          if (!cancelled) {
            setError("Invalid SMILES");
            setLoading(false);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load chemistry engine");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [smiles, width, height]);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/6 bg-[#080b12]">
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
        <Hexagon size={12} className="text-emerald-400/60" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-white/25">
          Ligand Structure
        </span>
        {label && (
          <span className="ml-1 rounded bg-emerald-400/10 px-1.5 py-0.5 text-[10px] text-emerald-300/60">
            {label}
          </span>
        )}
      </div>

      <div
        className="relative flex items-center justify-center p-3"
        style={{ minHeight: height + 24 }}
      >
        {loading && (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={16} className="animate-spin text-emerald-400/40" />
            <p className="text-[10px] text-white/20">Rendering…</p>
          </div>
        )}
        {error && (
          <p className="text-center text-[11px] text-red-400/60">{error}</p>
        )}
        <div ref={containerRef} className={loading || error ? "hidden" : "block"} />
      </div>

      {!loading && !error && (
        <div className="border-t border-white/5 px-3 py-1.5">
          <p className="truncate font-mono text-[9px] text-white/15" title={smiles}>
            {smiles}
          </p>
        </div>
      )}
    </div>
  );
}
