"use client";

import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import { Pagination } from "@/components/arc/pagination/pagination";
import { Badge } from "@/components/arc/badge/badge";
import React, { useMemo, useState, useCallback } from "react";
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
const SERVICE_COLOR: Record<string, { bg: string; ring: string; accent: string; label: string }> = {
  PROGRAMMABLE_GATE: { bg: "color-mix(in oklab, var(--success) 6%, transparent)",  ring: "color-mix(in oklab, var(--success) 30%, transparent)",  accent: "var(--success)", label: "PROG" },
  ENTANGLING_GATE:   { bg: "color-mix(in oklab, var(--info) 6%, transparent)", ring: "color-mix(in oklab, var(--info) 30%, transparent)", accent: "var(--info)", label: "ENT"  },
  MEASUREMENT_GATE:  { bg: "color-mix(in oklab, var(--warning) 6%, transparent)",  ring: "color-mix(in oklab, var(--warning) 30%, transparent)",  accent: "var(--warning)", label: "MEAS" },
  RESET_GATE:        { bg: "color-mix(in oklab, var(--danger) 6%, transparent)", ring: "color-mix(in oklab, var(--danger) 30%, transparent)", accent: "var(--danger)", label: "RST"  },
};
const DEFAULT_COLOR = { bg: "color-mix(in oklab, var(--foreground) 3%, transparent)", ring: "color-mix(in oklab, var(--foreground) 12%, transparent)", accent: "color-mix(in oklab, var(--foreground) 31.4%, transparent)", label: "GATE" };
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
  const fidelityColor = fidelity == null ? "color-mix(in oklab, var(--foreground) 30%, transparent)"
    : fidelity >= 0.9 ? "var(--success)"
    : fidelity >= 0.7 ? "var(--warning)"
    : "var(--danger)";

  const borderColor = selected
    ? "color-mix(in oklab, var(--warning) 85%, transparent)"
    : hasResult
      ? isSuccess ? color.ring : "color-mix(in oklab, var(--danger) 45%, transparent)"
      : color.ring;

  return (
    <div
      style={{
        background: selected ? "color-mix(in oklab, var(--warning) 4%, transparent)" : color.bg,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 12,
        padding: "10px 14px 10px",
        width: 168,
        fontFamily: "ui-monospace, 'Cascadia Code', 'SF Mono', monospace",
        position: "relative",
        boxShadow: selected ? "var(--shadow-raised)" : "var(--shadow-resting)",
        cursor: "grab",
        transition: "box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "relative", zIndex: 2 }}>
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: color.accent,
          border: `2px solid color-mix(in oklab, var(--background) 60%, transparent)`,
          width: 10,
          height: 10,
          left: -5
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: color.accent,
          border: `2px solid color-mix(in oklab, var(--background) 60%, transparent)`,
          width: 10,
          height: 10,
          right: -5
        }}
      />

      {/* Header row: badge + status */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{
          fontSize: "var(--text-xs)",
          fontWeight: 500,
          color: color.accent,
          background: `color-mix(in oklab, ${color.accent} 9%, transparent)`,
          border: `1px solid color-mix(in oklab, ${color.accent} 19%, transparent)`,
          borderRadius: 4,
          padding: "1px 5px",
        }}>
          {color.label}
        </span>
        {/* Status indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {isSuccess && (
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)" }} />
            </div>
          )}
          {isFailed && (
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--danger)" }} />
          )}
          {!hasResult && (
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "color-mix(in oklab, var(--foreground) 15%, transparent)" }} />
          )}
        </div>
      </div>

      {/* Fragment ID */}
      <div style={{ fontSize: "var(--text-sm)", color: "color-mix(in oklab, var(--foreground) 85%, transparent)", fontWeight: 500, marginBottom: 5 }}>
        {data.fragmentId.length > 16 ? `…${data.fragmentId.slice(-12)}` : data.fragmentId}
      </div>

      {/* Qubits + ops */}
      <div style={{ fontSize: "var(--text-xs)", color: "color-mix(in oklab, var(--foreground) 38%, transparent)", marginBottom: 6, display: "flex", gap: 6 }}>
        <span>q[{data.qubits.slice(0, 4).join(",")}]</span>
        <span style={{ color: "color-mix(in oklab, var(--foreground) 18%, transparent)" }}>·</span>
        <span>{data.operationIds.length} op{data.operationIds.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "color-mix(in oklab, var(--foreground) 5%, transparent)", marginBottom: 7 }} />

      {/* Assigned node */}
      {data.assignedNode ? (
        <div style={{ fontSize: "var(--text-xs)", color: "color-mix(in oklab, var(--foreground) 22%, transparent)", marginBottom: fidelityPct ? 5 : 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          ↳ {data.assignedNode.length > 20 ? `${data.assignedNode.slice(0, 18)}…` : data.assignedNode}
        </div>
      ) : (
        <div style={{ fontSize: "var(--text-xs)", color: "color-mix(in oklab, var(--foreground) 15%, transparent)", marginBottom: fidelityPct ? 5 : 0 }}>
          ↳ local execution
        </div>
      )}

      {/* Fidelity bar */}
      {fidelityPct !== null && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: "var(--text-xs)", color: "color-mix(in oklab, var(--foreground) 25%, transparent)" }}>fidelity</span>
            <span style={{ fontSize: "var(--text-xs)", color: fidelityColor, fontWeight: 500 }}>{fidelityPct}%</span>
          </div>
          <div style={{ height: 3, background: "color-mix(in oklab, var(--foreground) 6%, transparent)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${fidelityPct}%`, background: fidelityColor, borderRadius: 2, transition: "width 0.4s ease" }} />
          </div>
        </div>
      )}

      {/* Gate/depth row */}
      {(result?.gate_count != null || result?.circuit_depth != null) && (
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          {result?.gate_count != null && (
            <span style={{ fontSize: "var(--text-xs)", color: "color-mix(in oklab, var(--foreground) 22%, transparent)", background: "color-mix(in oklab, var(--foreground) 4%, transparent)", borderRadius: 3, padding: "1px 4px" }}>
              {result.gate_count}g
            </span>
          )}
          {result?.circuit_depth != null && (
            <span style={{ fontSize: "var(--text-xs)", color: "color-mix(in oklab, var(--foreground) 22%, transparent)", background: "color-mix(in oklab, var(--foreground) 4%, transparent)", borderRadius: 3, padding: "1px 4px" }}>
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
        background: "color-mix(in oklab, var(--foreground) 1.2%, transparent)",
        border: "1px dashed color-mix(in oklab, var(--foreground) 6%, transparent)",
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
      background: "color-mix(in oklab, var(--warning) 6%, transparent)",
      border: "1px solid color-mix(in oklab, var(--warning) 12%, transparent)",
      borderRadius: 6,
      fontFamily: "ui-monospace, monospace",
      fontSize: "var(--text-xs)",
      fontWeight: 500,
      color: "color-mix(in oklab, var(--warning) 55%, transparent)",
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
          { label: "Fragments", value: fragmentCount, accent: "text-subtle" },
          { label: "Stages",    value: stageCount,    accent: "text-subtle" },
          { label: "Executed",  value: successCount,  accent: "text-success" },
          { label: "Failed",    value: failedCount,   accent: failedCount > 0 ? "text-danger" : "text-faint" },
        ].map(({ label, value, accent }) => (
          <div key={label} className="rounded-lg bg-surface-muted px-3.5 py-2 ring-1 ring-border">
            <p className="text-xs text-faint">{label}</p>
            <p className={`font-mono text-sm font-medium tabular-nums ${accent}`}>{value}</p>
          </div>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-4 rounded-lg bg-surface-muted px-4 py-2.5 ring-1 ring-border">
          {Object.entries(SERVICE_COLOR).map(([, val]) => (
            <div key={val.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: val.accent }} />
              <span className="text-xs font-medium text-subtle">{val.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Flow canvas */}
      <div className="overflow-hidden rounded-2xl ring-1 ring-border" style={{ height: canvasHeight }}>
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
          style={{ background: "color-mix(in oklab, var(--background) 0%, transparent)" }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="color-mix(in oklab, var(--warning) 18%, transparent)" />
          <Controls
            style={{
              background: "color-mix(in oklab, var(--background) 85%, transparent)",
              border: "1px solid color-mix(in oklab, var(--foreground) 8%, transparent)",
              borderRadius: 10,
            }}
            showInteractive={false}
          />
          <MiniMap
            style={{
              background: "color-mix(in oklab, var(--background) 85%, transparent)",
              border: "1px solid color-mix(in oklab, var(--foreground) 8%, transparent)",
              borderRadius: 10,
            }}
            maskColor="color-mix(in oklab, var(--background) 60%, transparent)"
            nodeColor={(n) => {
              if (n.type !== "fragment") return "color-mix(in oklab, var(--foreground) 4%, transparent)";
              const d = n.data as unknown as FragmentNodePayload;
              if (selectedFragmentId && n.id === selectedFragmentId) return gateColor(d.serviceType).accent;
              return `color-mix(in oklab, ${gateColor(d.serviceType).accent} 53%, transparent)`;
            }}
          />
        </ReactFlow>
      </div>

      {/* Fragment results table with pagination */}
      {fragmentResults.length > 0 && (
        <div className="flex flex-col gap-3">
          <SortableDataTable
            caption="Fragment results"
            rowKey="fragment_id"
            selectable
            itemName={{ one: "fragment", other: "fragments" }}
            selectedKeys={selectedFragmentId ? [selectedFragmentId] : []}
            onSelectionChange={(keys) => handleSelectFragment(keys.filter((k) => k !== selectedFragmentId).at(-1) ?? null)}
            rows={pageRows.map((r) => ({
              fragment_id: String(r.fragment_id ?? ""),
              node_id: String(r.node_id ?? "-"),
              status: String(r.status ?? "-"),
              fidelity: (r.observed_fidelity as number | null) ?? null,
              attempts: Number(r.attempts ?? 0),
              gate_count: Number(r.gate_count ?? 0),
              circuit_depth: Number(r.circuit_depth ?? 0),
            }))}
            columns={[
              { key: "fragment_id", label: "Fragment", render: (v) => <span className="font-mono text-xs">{v as string}</span> },
              { key: "node_id", label: "Node", render: (v) => <span className="font-mono text-xs">{v as string}</span> },
              { key: "status", label: "Status", render: (v) => <Badge tone={v === "SUCCESS" ? "success" : "danger"}>{v as string}</Badge> },
              {
                key: "fidelity",
                label: "Fidelity",
                numeric: true,
                render: (v) => {
                  const f = v as number | null;
                  const tone = f == null ? "text-faint" : f >= 0.9 ? "text-success" : f >= 0.7 ? "text-warning" : "text-danger";
                  return <span className={tone}>{f != null ? `${(f * 100).toFixed(2)}%` : "-"}</span>;
                },
              },
              { key: "attempts", label: "Attempts", numeric: true },
              { key: "gate_count", label: "Gates", numeric: true },
              { key: "circuit_depth", label: "Depth", numeric: true },
            ]}
          />
          {totalPages > 1 && (
            <Pagination page={currentPage} pageCount={totalPages} onPageChange={setCurrentPage} label="Fragment pages" />
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
      <div className="flex h-44 items-center justify-center rounded-xl bg-surface-muted ring-1 ring-border">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="text-2xl opacity-20">◈</div>
          <p className="text-sm text-faint">Fragment execution plan not yet available</p>
          <p className="text-xs text-faint">Circuit runs locally as a single block</p>
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
