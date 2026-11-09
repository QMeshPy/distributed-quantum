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
    path, line { stroke: color-mix(in oklab, var(--foreground) 80%, transparent) !important; fill: none !important; }
    path[fill]:not([fill="none"]) { fill: color-mix(in oklab, var(--foreground) 80%, transparent) !important; }
    ellipse, circle { stroke: color-mix(in oklab, var(--foreground) 80%, transparent) !important; }
    text, tspan { fill: color-mix(in oklab, var(--foreground) 80%, transparent) !important; stroke: none !important; }
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
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Hexagon size={12} className="text-success" />
        <span className="text-xs font-medium text-faint">
          Ligand Structure
        </span>
        {label && (
          <span className="ml-1 rounded bg-success/10 px-1.5 py-0.5 text-xs text-success">
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
            <Loader2 size={16} className="animate-spin text-success" />
            <p className="text-xs text-faint">Rendering…</p>
          </div>
        )}
        {error && (
          <p className="text-center text-xs text-danger">{error}</p>
        )}
        <div ref={containerRef} className={loading || error ? "hidden" : "block"} />
      </div>

      {!loading && !error && (
        <div className="border-t border-border px-3 py-1.5">
          <p className="truncate font-mono text-xs text-faint" title={smiles}>
            {smiles}
          </p>
        </div>
      )}
    </div>
  );
}
