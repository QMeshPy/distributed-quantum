"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Maximize2, Layers } from "lucide-react";

type RepStyle = "cartoon" | "surface" | "ball+stick";

interface Props {
  pdbId: string;
  height?: number;
  onStageReady?: (stage: any) => void;
}

const REP_LABELS: { key: RepStyle; label: string }[] = [
  { key: "cartoon", label: "Ribbon" },
  { key: "surface", label: "Surface" },
  { key: "ball+stick", label: "Ball+Stick" },
];

export function ProteinViewer({ pdbId, height = 380, onStageReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stageRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repStyle, setRepStyle] = useState<RepStyle>("cartoon");

  // Load NGL and initialise the stage
  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    import("ngl").then((NGL) => {
      if (cancelled || !containerRef.current) return;

      // Clean up any previous stage
      if (stageRef.current) {
        stageRef.current.dispose();
        stageRef.current = null;
      }

      const stage = new NGL.Stage(containerRef.current, {
        backgroundColor: "#080b12",
        quality: "medium",
        impostor: true,
        tooltip: false,
      });
      stageRef.current = stage;

      // Responsive resize
      const ro = new ResizeObserver(() => stage.handleResize());
      ro.observe(containerRef.current!);

      // Load the PDB from RCSB
      stage
        .loadFile(`rcsb://${pdbId.toUpperCase()}`, { defaultRepresentation: false })
        .then((comp: any) => {
          if (cancelled) return;

          // Protein ribbon colored by chain
          comp.addRepresentation("cartoon", {
            colorScheme: "chainid",
            smoothSheet: true,
            quality: "high",
          });

          // Ligand/heteroatoms as ball+stick
          comp.addRepresentation("ball+stick", {
            sele: "ligand",
            colorScheme: "element",
            quality: "high",
          });

          // Binding pocket surface (transparent)
          comp.addRepresentation("surface", {
            sele: "protein and (20 around ligand)",
            colorScheme: "electrostatic",
            opacity: 0.18,
            quality: "medium",
          });

          stage.autoView();
          setLoading(false);
          onStageReady?.(stage);
        })
        .catch((err: Error) => {
          if (!cancelled) setError(`Could not load ${pdbId}: ${err.message}`);
          setLoading(false);
        });

      return () => {
        ro.disconnect();
      };
    });

    return () => {
      cancelled = true;
      if (stageRef.current) {
        stageRef.current.dispose();
        stageRef.current = null;
      }
    };
  // Re-mount when pdbId changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdbId]);

  // Toggle representation style
  function applyRep(style: RepStyle) {
    const stage = stageRef.current;
    if (!stage) return;
    setRepStyle(style);
    stage.compList.forEach((comp: any) => {
      comp.removeAllRepresentations();
      if (style === "cartoon") {
        comp.addRepresentation("cartoon", { colorScheme: "chainid", smoothSheet: true });
        comp.addRepresentation("ball+stick", { sele: "ligand", colorScheme: "element" });
        comp.addRepresentation("surface", {
          sele: "protein and (20 around ligand)",
          colorScheme: "electrostatic",
          opacity: 0.18,
        });
      } else if (style === "surface") {
        comp.addRepresentation("surface", {
          colorScheme: "electrostatic",
          opacity: 0.75,
          quality: "medium",
        });
        comp.addRepresentation("ball+stick", { sele: "ligand", colorScheme: "element" });
      } else {
        comp.addRepresentation("ball+stick", { colorScheme: "element" });
      }
    });
  }

  function resetView() {
    stageRef.current?.autoView(500);
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/6 bg-[#080b12]">
      {/* Header bar */}
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
        <Layers size={12} className="text-sky-400/60" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-white/25">
          3D Protein Structure
        </span>
        <code className="ml-1 rounded bg-sky-400/10 px-1.5 py-0.5 font-mono text-[10px] text-sky-300/70">
          {pdbId.toUpperCase()}
        </code>

        {/* Rep toggles */}
        <div className="ml-auto flex items-center gap-1">
          {REP_LABELS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => applyRep(key)}
              disabled={loading}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition-all disabled:opacity-30 ${
                repStyle === key
                  ? "bg-sky-400/15 text-sky-300"
                  : "text-white/25 hover:text-white/50"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={resetView}
            disabled={loading}
            title="Reset view"
            className="ml-1 rounded p-1 text-white/20 transition-all hover:text-white/50 disabled:opacity-30"
          >
            <RotateCcw size={11} />
          </button>
        </div>
      </div>

      {/* Viewer canvas */}
      <div className="relative" style={{ height }}>
        <div ref={containerRef} className="h-full w-full" />

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#080b12]/80">
            <Loader2 size={20} className="animate-spin text-sky-400/50" />
            <p className="text-[11px] text-white/25">
              Loading {pdbId.toUpperCase()} from RCSB…
            </p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <p className="text-center text-[11px] text-red-400/70">{error}</p>
          </div>
        )}
      </div>

      {/* Footer hint */}
      {!loading && !error && (
        <div className="border-t border-white/5 px-3 py-1.5">
          <p className="text-[10px] text-white/15">
            Drag to rotate · Scroll to zoom · Right-drag to translate ·
            Ligand shown as ball+stick · Binding pocket surface (electrostatic)
          </p>
        </div>
      )}
    </div>
  );
}
