"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";

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
    <div className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-[#080b12]" style={{ height }}>
      <div ref={containerRef} className="h-full w-full" />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <span className="rounded-md bg-black/50 px-2 py-1 font-mono text-[11px] text-white/70 backdrop-blur">
          PDB {pdbId.toUpperCase()}
        </span>
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg bg-black/50 p-0.5 backdrop-blur" role="group" aria-label="Representation">
          {REP_LABELS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => applyRep(key)}
              disabled={loading}
              aria-pressed={repStyle === key}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-30 ${
                repStyle === key ? "bg-white/15 text-white" : "text-white/45 hover:text-white/80"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={resetView}
            disabled={loading}
            aria-label="Reset view"
            className="rounded-md p-1.5 text-white/45 transition-colors hover:text-white/80 disabled:opacity-30"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Loader2 size={20} className="animate-spin text-white/30" />
          <p className="text-[11px] text-white/35">Loading {pdbId.toUpperCase()} from RCSB…</p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <p className="text-center text-[11px] text-rose-300/80">{error}</p>
        </div>
      )}
      {!loading && !error && (
        <p className="pointer-events-none absolute bottom-3 left-3 text-[10px] text-white/30">
          Drag to rotate · scroll to zoom · pocket surface coloured by charge
        </p>
      )}
    </div>
  );
}
