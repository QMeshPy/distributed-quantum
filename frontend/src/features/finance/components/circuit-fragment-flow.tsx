"use client";
import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  Position,
  Handle,
  MarkerType,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// ── Types ────────────────────────────────────────────────────────────────────
interface FragmentData {
  fragment_id: string;
  service_type: string;
  qubits: number[];
  operation_ids: string[];
  dependencies: string[];
}

interface StageData {
  stage_id: string;
  stage_index: number;
  fragment_ids: string[];
  block_ids: string[];
}

interface AssignmentData {
  fragment_id: string;
  primary_node_id: string;
  stage_index: number;
}

interface FragmentResultData {
  fragment_id: string;
  node_id: string;
  status: string;
  attempts: number;
  observed_fidelity: number | null;
  started_at: string | null;
  finished_at: string | null;
  gate_count?: number | null;
  circuit_depth?: number | null;
  component_qubits?: number[] | null;
  distributed_execution?: boolean;
}

export interface CircuitPlan {
  plan_id?: string;
  fragment_order?: string[];
  fragments?: Record<string, FragmentData>;
  assignments?: Record<string, AssignmentData>;
  stages?: StageData[];
}

interface CircuitFragmentFlowProps {
  plan: CircuitPlan | null | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fragmentResults: any[] | null | undefined;
}

// ── Gate type colors ──────────────────────────────────────────────────────────
const SERVICE_COLOR: Record<string, { bg: string; ring: string; accent: string; glow: string; label: string }> = {
  PROGRAMMABLE_GATE: { bg: "rgba(52,211,153,0.06)",  ring: "rgba(52,211,153,0.30)",  glow: "rgba(52,211,153,0.12)",  accent: "#34d399", label: "PROG" },
  ENTANGLING_GATE:   { bg: "rgba(103,232,249,0.06)", ring: "rgba(103,232,249,0.30)", glow: "rgba(103,232,249,0.12)", accent: "#67e8f9", label: "ENT"  },
  MEASUREMENT_GATE:  { bg: "rgba(251,191,36,0.06)",  ring: "rgba(251,191,36,0.30)",  glow: "rgba(251,191,36,0.12)",  accent: "#fbbf24", label: "MEAS" },
  RESET_GATE:        { bg: "rgba(248,113,113,0.06)", ring: "rgba(248,113,113,0.30)", glow: "rgba(248,113,113,0.12)", accent: "#f87171", label: "RST"  },
};
const DEFAULT_COLOR = { bg: "rgba(255,255,255,0.03)", ring: "rgba(255,255,255,0.12)", glow: "rgba(255,255,255,0.04)", accent: "#ffffff50", label: "GATE" };
function gateColor(serviceType: string) {
  return SERVICE_COLOR[serviceType.toUpperCase()] ?? DEFAULT_COLOR;
}

// ── Fragment node component ───────────────────────────────────────────────────
interface FragmentNodePayload {
  fragmentId: string;
  serviceType: string;
  qubits: number[];
  operationIds: string[];
  stageIndex: number;
  assignedNode: string | null;
  result: FragmentResultData | null;
}

function FragmentNode({ data, selected }: { data: FragmentNodePayload; selected?: boolean }) {
  const color = gateColor(data.serviceType);
  const result = data.result;
  const isSuccess = result?.status === "SUCCESS";
  const isFailed  = result?.status === "FAILED";
  const hasResult = result !== null;

  const fidelity = result?.observed_fidelity;
  const fidelityPct = fidelity != null ? (fidelity * 100).toFixed(1) : null;
  const fidelityColor = fidelity == null ? "rgba(255,255,255,0.30)"
    : fidelity >= 0.9 ? "#34d399"
    : fidelity >= 0.7 ? "#fbbf24"
    : "#f87171";

  const borderColor = selected
    ? "rgba(251,146,60,0.85)"
    : hasResult
      ? isSuccess ? color.ring : "rgba(248,113,113,0.45)"
      : color.ring;

  return (
    <div
      style={{
        background: selected ? "rgba(251,146,60,0.04)" : color.bg,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 12,
        padding: "10px 14px 10px",
        width: 168,
        fontFamily: "ui-monospace, 'Cascadia Code', 'SF Mono', monospace",
        position: "relative",
        boxShadow: selected
          ? "0 0 0 3px rgba(251,146,60,0.18), 0 0 24px rgba(251,146,60,0.22), 0 4px 16px rgba(0,0,0,0.5)"
          : `0 2px 12px rgba(0,0,0,0.35)`,
        cursor: "grab",
        transition: "box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease",
        overflow: "hidden",
      }}
    >
      {/* Orange gradient wash overlay when selected — mirrors dashboard card hover */}
      {selected && (
        <div style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(135deg, rgba(251,146,60,0.18) 0%, rgba(251,146,60,0.06) 40%, transparent 70%)",
          borderRadius: 11,
          pointerEvents: "none",
          zIndex: 0,
        }} />
      )}
      {/* Animated top-edge highlight stripe */}
      {selected && (
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: "linear-gradient(90deg, transparent, rgba(251,146,60,0.9), rgba(251,191,36,0.8), rgba(251,146,60,0.9), transparent)",
          borderRadius: "11px 11px 0 0",
          zIndex: 1,
        }} />
      )}
      {/* Content wrapper sits above gradient overlay */}
      <div style={{ position: "relative", zIndex: 2 }}>
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: color.accent,
          border: `2px solid rgba(0,0,0,0.6)`,
          width: 10,
          height: 10,
          left: -5,
          boxShadow: `0 0 6px ${color.glow}`,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: color.accent,
          border: `2px solid rgba(0,0,0,0.6)`,
          width: 10,
          height: 10,
          right: -5,
          boxShadow: `0 0 6px ${color.glow}`,
        }}
      />

      {/* Header row: badge + status */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{
          fontSize: 9,
          fontWeight: 800,
          color: color.accent,
          letterSpacing: "0.12em",
          background: `${color.accent}18`,
          border: `1px solid ${color.accent}30`,
          borderRadius: 4,
          padding: "1px 5px",
        }}>
          {color.label}
        </span>
        {/* Status indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {isSuccess && (
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 5px rgba(52,211,153,0.8)" }} />
            </div>
          )}
          {isFailed && (
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f87171", boxShadow: "0 0 5px rgba(248,113,113,0.8)" }} />
          )}
          {!hasResult && (
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.15)" }} />
          )}
        </div>
      </div>

      {/* Fragment ID */}
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", fontWeight: 700, marginBottom: 5, letterSpacing: "-0.01em" }}>
        {data.fragmentId.length > 16 ? `…${data.fragmentId.slice(-12)}` : data.fragmentId}
      </div>

      {/* Qubits + ops */}
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", marginBottom: 6, display: "flex", gap: 6 }}>
        <span>q[{data.qubits.slice(0, 4).join(",")}]</span>
        <span style={{ color: "rgba(255,255,255,0.18)" }}>·</span>
        <span>{data.operationIds.length} op{data.operationIds.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginBottom: 7 }} />

      {/* Assigned node */}
      {data.assignedNode ? (
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", marginBottom: fidelityPct ? 5 : 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          ↳ {data.assignedNode.length > 20 ? `${data.assignedNode.slice(0, 18)}…` : data.assignedNode}
        </div>
      ) : (
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.15)", marginBottom: fidelityPct ? 5 : 0 }}>
          ↳ local execution
        </div>
      )}

      {/* Fidelity bar */}
      {fidelityPct !== null && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>fidelity</span>
            <span style={{ fontSize: 10, color: fidelityColor, fontWeight: 700 }}>{fidelityPct}%</span>
          </div>
          <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${fidelityPct}%`, background: fidelityColor, borderRadius: 2, transition: "width 0.4s ease" }} />
          </div>
        </div>
      )}

      {/* Gate/depth row */}
      {(result?.gate_count != null || result?.circuit_depth != null) && (
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          {result?.gate_count != null && (
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.04)", borderRadius: 3, padding: "1px 4px" }}>
              {result.gate_count}g
            </span>
          )}
          {result?.circuit_depth != null && (
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.04)", borderRadius: 3, padding: "1px 4px" }}>
              d{result.circuit_depth}
            </span>
          )}
        </div>
      )}
      </div>{/* /content wrapper */}
    </div>
  );
}

// ── Stage lane background node ────────────────────────────────────────────────
function StageLaneNode({ data }: { data: { stageIndex: number; fragmentCount: number; laneHeight: number } }) {
  return (
    <div
      style={{
        width: 168,
        height: data.laneHeight,
        background: "rgba(255,255,255,0.012)",
        border: "1px dashed rgba(255,255,255,0.06)",
        borderRadius: 16,
        pointerEvents: "none",
      }}
    />
  );
}

// ── Stage label node ──────────────────────────────────────────────────────────
function StageLabelNode({ data }: { data: { stageIndex: number; fragmentCount: number } }) {
  return (
    <div style={{
      padding: "3px 10px",
      background: "rgba(255,146,60,0.06)",
      border: "1px solid rgba(255,146,60,0.12)",
      borderRadius: 6,
      fontFamily: "ui-monospace, monospace",
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: "0.12em",
      color: "rgba(251,146,60,0.55)",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
      pointerEvents: "none",
    }}>
      Stage {data.stageIndex} · {data.fragmentCount} frag{data.fragmentCount !== 1 ? "s" : ""}
    </div>
  );
}

const nodeTypes = {
  fragment: FragmentNode,
  stageLabel: StageLabelNode,
  stageLane: StageLaneNode,
} as const;

// ── Layout constants ──────────────────────────────────────────────────────────
const NODE_W    = 168;
const NODE_H    = 145;   // generous height to fit all content
const H_GAP     = 80;    // horizontal gap between stage columns
const V_GAP     = 20;    // vertical gap between fragments in a column
const LANE_PAD  = 20;    // padding inside stage lane
const STAGE_X_STEP = NODE_W + H_GAP;

function buildGraph(
  plan: CircuitPlan,
  fragmentResults: FragmentResultData[],
): { nodes: Node[]; edges: Edge[] } {
  const fragments  = plan.fragments  ?? {};
  const assignments = plan.assignments ?? {};
  const stages      = plan.stages     ?? [];

  // Build result lookup
  const resultMap = new Map<string, FragmentResultData>();
  for (const r of fragmentResults) resultMap.set(r.fragment_id, r);

  // Group fragments by stage_index
  const stageMap = new Map<number, string[]>();
  if (stages.length > 0) {
    for (const stage of stages) stageMap.set(stage.stage_index, [...stage.fragment_ids]);
  } else {
    for (const [fragId, assignment] of Object.entries(assignments)) {
      const si = (assignment as AssignmentData).stage_index ?? 0;
      if (!stageMap.has(si)) stageMap.set(si, []);
      stageMap.get(si)!.push(fragId);
    }
    if (stageMap.size === 0) stageMap.set(0, Object.keys(fragments));
  }

  const sortedStages = [...stageMap.entries()].sort((a, b) => a[0] - b[0]);
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  for (const [stageIdx, fragIds] of sortedStages) {
    const x         = stageIdx * STAGE_X_STEP;
    const laneH     = fragIds.length * NODE_H + (fragIds.length - 1) * V_GAP + LANE_PAD * 2;
    const startY    = -(laneH / 2) + LANE_PAD;

    // Stage lane background (behind fragments, non-interactive)
    nodes.push({
      id:          `lane-${stageIdx}`,
      type:        "stageLane",
      position:    { x: x - 10, y: -laneH / 2 },
      draggable:   false,
      selectable:  false,
      zIndex:      -1,
      data: { stageIndex: stageIdx, fragmentCount: fragIds.length, laneHeight: laneH },
    });

    // Stage label above lane
    nodes.push({
      id:          `stage-label-${stageIdx}`,
      type:        "stageLabel",
      position:    { x: x - 10, y: -laneH / 2 - 32 },
      draggable:   false,
      selectable:  false,
      zIndex:      1,
      data: { stageIndex: stageIdx, fragmentCount: fragIds.length },
    });

    fragIds.forEach((fragId, i) => {
      const frag = fragments[fragId];
      if (!frag) return;
      const assignment = assignments[fragId] as AssignmentData | undefined;
      const result     = resultMap.get(fragId) ?? null;

      nodes.push({
        id:        fragId,
        type:      "fragment",
        position:  { x, y: startY + i * (NODE_H + V_GAP) },
        draggable: true,
        zIndex:    2,
        data: {
          fragmentId:   fragId,
          serviceType:  frag.service_type,
          qubits:       frag.qubits,
          operationIds: frag.operation_ids,
          stageIndex:   stageIdx,
          assignedNode: assignment?.primary_node_id ?? null,
          result,
        } satisfies FragmentNodePayload,
      });
    });
  }

  // Dependency edges with accent color from source gate type
  for (const [fragId, frag] of Object.entries(fragments)) {
    const srcColor = gateColor(frag.service_type);
    for (const dep of frag.dependencies) {
      edges.push({
        id:     `${dep}->${fragId}`,
        source: dep,
        target: fragId,
        type:   "smoothstep",
        style:  { stroke: srcColor.accent + "55", strokeWidth: 1.5 },
        markerEnd: {
          type:   MarkerType.ArrowClosed,
          color:  srcColor.accent + "66",
          width:  12,
          height: 12,
        },
      });
    }
  }

  return { nodes, edges };
}

// ── Constants ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 10;

// ── Inner flow component (inside ReactFlowProvider, can use useReactFlow) ──
interface FlowInnerProps {
  nodes: Node[];
  edges: Edge[];
  fragmentCount: number;
  stageCount: number;
  fragmentResults: Record<string, unknown>[];
  canvasHeight: number;
  selectedFragmentId: string | null;
  onSelectFragment: (id: string | null) => void;
}

function FlowInner({
  nodes,
  edges,
  fragmentCount,
  stageCount,
  fragmentResults,
  canvasHeight,
  selectedFragmentId,
  onSelectFragment,
}: FlowInnerProps) {
  const { fitView, setNodes } = useReactFlow();
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(fragmentResults.length / PAGE_SIZE);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = fragmentResults.slice(pageStart, pageStart + PAGE_SIZE);

  const successCount = fragmentResults.filter(r => r.status === "SUCCESS").length;
  const failedCount  = fragmentResults.filter(r => r.status === "FAILED").length;

  // When a fragment is selected: highlight node + smooth pan+zoom to it
  const handleSelectFragment = useCallback((fragId: string | null) => {
    onSelectFragment(fragId);
    if (!fragId) {
      // Deselect: restore all nodes to unselected
      setNodes(nds => nds.map(n => ({ ...n, selected: false })));
      return;
    }
    // Mark the clicked node as selected, deselect all others
    setNodes(nds =>
      nds.map(n => ({ ...n, selected: n.id === fragId }))
    );
    // Smooth fitView to just that node
    setTimeout(() => {
      fitView({
        nodes: [{ id: fragId }],
        duration: 600,
        padding: 0.55,
        minZoom: 1.2,
        maxZoom: 2.0,
      });
    }, 30);
  }, [fitView, setNodes, onSelectFragment]);

  return (
    <div className="flex flex-col gap-4">
      {/* Stats + legend row */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { label: "Fragments", value: fragmentCount, accent: "text-white/65" },
          { label: "Stages",    value: stageCount,    accent: "text-white/65" },
          { label: "Executed",  value: successCount,  accent: "text-emerald-400" },
          { label: "Failed",    value: failedCount,   accent: failedCount > 0 ? "text-red-400" : "text-white/25" },
        ].map(({ label, value, accent }) => (
          <div key={label} className="rounded-lg bg-white/[0.03] px-3.5 py-2 ring-1 ring-white/[0.07]">
            <p className="text-[10px] text-white/30">{label}</p>
            <p className={`font-mono text-sm font-semibold tabular-nums ${accent}`}>{value}</p>
          </div>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-4 rounded-lg bg-white/[0.025] px-4 py-2.5 ring-1 ring-white/[0.07]">
          {Object.entries(SERVICE_COLOR).map(([, val]) => (
            <div key={val.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: val.accent, boxShadow: `0 0 4px ${val.glow}` }} />
              <span className="text-[10px] font-medium text-white/40">{val.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Flow canvas */}
      <div className="overflow-hidden rounded-2xl ring-1 ring-white/8" style={{ height: canvasHeight }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.2}
          maxZoom={2.5}
          nodesDraggable={true}
          panOnDrag={true}
          zoomOnScroll={true}
          onPaneClick={() => handleSelectFragment(null)}
          attributionPosition="bottom-right"
          proOptions={{ hideAttribution: true }}
          style={{ background: "rgba(0,0,0,0)" }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="rgba(251,146,60,0.18)" />
          <Controls
            style={{
              background: "rgba(18,18,18,0.85)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              backdropFilter: "blur(8px)",
            }}
            showInteractive={false}
          />
          <MiniMap
            style={{
              background: "rgba(12,12,12,0.85)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
            }}
            maskColor="rgba(0,0,0,0.6)"
            nodeColor={(n) => {
              if (n.type !== "fragment") return "rgba(255,255,255,0.04)";
              const d = n.data as unknown as FragmentNodePayload;
              if (selectedFragmentId && n.id === selectedFragmentId) return gateColor(d.serviceType).accent;
              return gateColor(d.serviceType).accent + "88";
            }}
          />
        </ReactFlow>
      </div>

      {/* Fragment results table with pagination */}
      {fragmentResults.length > 0 && (
        <div className="flex flex-col gap-0 overflow-hidden rounded-xl bg-white/[0.015] ring-1 ring-white/[0.07]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {["Fragment", "Node", "Status", "Fidelity", "Attempts", "Gates", "Depth"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-white/25 ${i === 0 ? "text-left" : i <= 1 ? "text-left" : i === 2 ? "text-center" : "text-right"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, idx) => {
                const fragId = String(r.fragment_id ?? "");
                const isSelected = selectedFragmentId === fragId;
                const fidelity = r.observed_fidelity as number | null;
                const fidelityColor =
                  fidelity == null ? "text-white/25"
                  : fidelity >= 0.9 ? "text-emerald-400"
                  : fidelity >= 0.7 ? "text-amber-400"
                  : "text-red-400";
                return (
                  <tr
                    key={fragId || idx}
                    onClick={() => handleSelectFragment(isSelected ? null : fragId)}
                    className="group/row cursor-pointer border-b border-white/[0.04] transition-all duration-200"
                    style={{
                      background: isSelected
                        ? "linear-gradient(90deg, rgba(251,146,60,0.14) 0%, rgba(251,146,60,0.06) 50%, transparent 100%)"
                        : undefined,
                      borderLeft: isSelected ? "2px solid rgba(251,146,60,0.70)" : "2px solid transparent",
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = "linear-gradient(90deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.02) 60%, transparent 100%)";
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = "";
                    }}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {isSelected && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" style={{ boxShadow: "0 0 5px rgba(251,146,60,0.9)" }} />
                        )}
                        <span className={`font-mono text-xs ${isSelected ? "text-orange-300" : "text-white/60"}`}>{fragId}</span>
                      </div>
                    </td>
                    <td className="max-w-[140px] truncate px-4 py-2.5 font-mono text-xs text-white/30">{String(r.node_id ?? "—")}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                        r.status === "SUCCESS"
                          ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                          : "bg-red-500/10 text-red-400 ring-1 ring-red-500/20"
                      }`}>
                        {String(r.status ?? "—")}
                      </span>
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono text-xs tabular-nums ${fidelityColor}`}>
                      {fidelity != null ? `${(fidelity * 100).toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-white/35">{String(r.attempts ?? "—")}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-white/35">{String(r.gate_count ?? "—")}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-white/35">{String(r.circuit_depth ?? "—")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination bar */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3">
              <p className="text-[11px] text-white/25">
                Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, fragmentResults.length)} of {fragmentResults.length} fragments
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-25"
                >
                  ← Prev
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  // Show pages: always show first, last, and current±1
                  const page = totalPages <= 7
                    ? i + 1
                    : i === 0 ? 1
                    : i === 6 ? totalPages
                    : Math.max(2, Math.min(totalPages - 1, currentPage - 2 + i));
                  return page;
                }).filter((p, i, arr) => arr.indexOf(p) === i).map((page, i, arr) => (
                  <React.Fragment key={page}>
                    {i > 0 && arr[i - 1] !== page - 1 && (
                      <span className="px-1 text-[11px] text-white/15">…</span>
                    )}
                    <button
                      onClick={() => setCurrentPage(page)}
                      className={[
                        "min-w-[28px] rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors",
                        currentPage === page
                          ? "bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/25"
                          : "text-white/40 hover:bg-white/[0.06] hover:text-white/70",
                      ].join(" ")}
                    >
                      {page}
                    </button>
                  </React.Fragment>
                ))}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-25"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main export (wraps provider) ─────────────────────────────────────────────
export function CircuitFragmentFlow({ plan, fragmentResults }: CircuitFragmentFlowProps) {
  const [selectedFragmentId, setSelectedFragmentId] = useState<string | null>(null);

  const { nodes: baseNodes, edges } = useMemo(() => {
    if (!plan || !plan.fragments || Object.keys(plan.fragments).length === 0)
      return { nodes: [], edges: [] };
    return buildGraph(plan, fragmentResults ?? []);
  }, [plan, fragmentResults]);

  // Inject selected state into nodes
  const nodes = useMemo(
    () => baseNodes.map(n => ({ ...n, selected: n.id === selectedFragmentId })),
    [baseNodes, selectedFragmentId],
  );

  const fragmentCount = nodes.filter(n => n.type === "fragment").length;
  const stageCount    = nodes.filter(n => n.type === "stageLabel").length;

  if (fragmentCount === 0) {
    return (
      <div className="flex h-44 items-center justify-center rounded-xl bg-white/[0.015] ring-1 ring-white/5">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="text-2xl opacity-20">◈</div>
          <p className="text-sm text-white/25">Fragment execution plan not yet available</p>
          <p className="text-[11px] text-white/15">Circuit runs locally as a single block</p>
        </div>
      </div>
    );
  }

  const maxFragsInStage = Math.max(
    ...nodes.filter(n => n.type === "stageLabel").map(n => (n.data as { fragmentCount: number }).fragmentCount)
  );
  const canvasHeight = Math.max(380, maxFragsInStage * (NODE_H + V_GAP) + 160);

  return (
    <ReactFlowProvider>
      <FlowInner
        nodes={nodes}
        edges={edges}
        fragmentCount={fragmentCount}
        stageCount={stageCount}
        fragmentResults={(fragmentResults ?? []) as Record<string, unknown>[]}
        canvasHeight={canvasHeight}
        selectedFragmentId={selectedFragmentId}
        onSelectFragment={setSelectedFragmentId}
      />
    </ReactFlowProvider>
  );
}
