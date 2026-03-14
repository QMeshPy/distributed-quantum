import type {
  FidelityMetricsResponse,
  JobStatus,
  JobStatusResponse,
  PlanResponse,
  ServiceResponse,
} from "@/lib/quantum-api"

export const SAMPLE_PIPELINE_CIRCUIT = `OPENQASM 3;
qubit[2] q;
bit[1] c;

bell_pair q[0], q[1];
cnot q[0], q[1];
cz q[0], q[1];
teleport q[0], q[1];
syndrome_extraction q[0];
distillation q[1];
measure q[0] -> c[0];`

export const QUICK_CHECK_CIRCUIT = `OPENQASM 2.0;
qreg q[2];

cx q[0], q[1];`

const SERVICE_LABELS: Record<string, string> = {
  bell_pair: "Bell Pair",
  cnot: "CNOT",
  cz: "CZ",
  teleportation: "Teleportation",
  syndrome_extraction: "Syndrome Extraction",
  distillation: "Distillation",
  measurement_feedforward: "Measurement Feedforward",
}

const CIRCUIT_SERVICE_ALIASES: Record<string, string> = {
  bell: "bell_pair",
  bell_pair: "bell_pair",
  cx: "cnot",
  cnot: "cnot",
  cz: "cz",
  distillation: "distillation",
  measure: "measurement_feedforward",
  measurement_feedforward: "measurement_feedforward",
  syndrome_extraction: "syndrome_extraction",
  teleport: "teleportation",
  teleportation: "teleportation",
}

export interface NetworkNode {
  nodeId: string
  shortId: string
  listenAddrs: string[]
  port: string | null
  serviceTypes: string[]
  serviceCount: number
  averageFidelity: number
  minQubits: number
  maxQubits: number
  availability: boolean
  metrics: FidelityMetricsResponse | null
}

export interface CircuitInsight {
  format: "OpenQASM 2" | "OpenQASM 3" | "Unknown"
  qubitCount: number
  operationCount: number
  measurementCount: number
  serviceBreakdown: Array<{ serviceType: string; count: number }>
}

export interface StatusLogEntry {
  status: JobStatus
  recordedAt: string
  source: "submit" | "stream" | "poll"
}

export interface DagNode {
  fragmentId: string
  serviceType: string
  label: string
  qubits: number[]
  dependencies: string[]
  depth: number
  x: number
  y: number
  width: number
  height: number
  primaryNodeId: string | null
  fallbackNodeIds: string[]
  status: string | null
  observedFidelity: number | null
}

export interface DagEdge {
  from: string
  to: string
  path: string
}

export interface DagModel {
  width: number
  height: number
  nodes: DagNode[]
  edges: DagEdge[]
}

export function shortId(value: string, head = 8, tail = 5) {
  if (value.length <= head + tail + 3) {
    return value
  }

  return `${value.slice(0, head)}...${value.slice(-tail)}`
}

export function formatServiceLabel(serviceType: string) {
  return SERVICE_LABELS[serviceType] || serviceType.replace(/_/g, " ")
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--"
  }

  return `${(value * 100).toFixed(digits)}%`
}

export function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "--"
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    month: "short",
    day: "2-digit",
  }).format(new Date(value))
}

export function formatDurationMs(
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined
) {
  if (!startedAt || !finishedAt) {
    return "--"
  }

  const duration = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  if (duration < 1000) {
    return `${duration.toFixed(0)} ms`
  }

  return `${(duration / 1000).toFixed(2)} s`
}

export function formatUptimeSeconds(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return "--"
  }

  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`
  }

  if (seconds < 3600) {
    return `${(seconds / 60).toFixed(1)} min`
  }

  return `${(seconds / 3600).toFixed(1)} hr`
}

export function extractPort(listenAddr: string) {
  const match = listenAddr.match(/\/tcp\/(\d+)/)
  return match?.[1] ?? null
}

export function groupServicesByNode(
  services: ServiceResponse[],
  metricsByNode: Record<string, FidelityMetricsResponse>
) {
  const nodes = new Map<string, NetworkNode>()

  for (const service of services) {
    const current = nodes.get(service.node_id)
    if (!current) {
      nodes.set(service.node_id, {
        nodeId: service.node_id,
        shortId: shortId(service.node_id),
        listenAddrs: [...service.listen_addrs],
        port: extractPort(service.listen_addrs[0] ?? ""),
        serviceTypes: [service.service_type],
        serviceCount: 1,
        averageFidelity: service.fidelity,
        minQubits: service.qubit_min,
        maxQubits: service.qubit_max,
        availability: service.availability,
        metrics: metricsByNode[service.node_id] ?? null,
      })
      continue
    }

    current.listenAddrs = Array.from(
      new Set([...current.listenAddrs, ...service.listen_addrs])
    )
    current.serviceTypes = Array.from(
      new Set([...current.serviceTypes, service.service_type])
    )
    current.serviceCount += 1
    current.averageFidelity += service.fidelity
    current.minQubits = Math.min(current.minQubits, service.qubit_min)
    current.maxQubits = Math.max(current.maxQubits, service.qubit_max)
    current.availability = current.availability && service.availability
    current.metrics = metricsByNode[service.node_id] ?? current.metrics
  }

  return Array.from(nodes.values())
    .map((node) => ({
      ...node,
      averageFidelity:
        node.metrics?.average_fidelity ?? node.averageFidelity / node.serviceCount,
      serviceTypes: [...node.serviceTypes].sort((left, right) =>
        formatServiceLabel(left).localeCompare(formatServiceLabel(right))
      ),
    }))
    .sort((left, right) => right.averageFidelity - left.averageFidelity)
}

export function appendStatusLog(
  currentEntries: StatusLogEntry[],
  nextEntry: StatusLogEntry
) {
  const previousEntry = currentEntries[currentEntries.length - 1]
  if (previousEntry?.status === nextEntry.status) {
    return currentEntries
  }

  return [...currentEntries, nextEntry]
}

export function analyzeCircuitText(circuit: string): CircuitInsight {
  const lines = circuit
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  let qubitCount = 0
  const serviceCounts: Record<string, number> = {}

  for (const line of lines) {
    if (line.startsWith("//")) {
      continue
    }

    const declarationMatch = line.match(/^(?:qreg|qubit)\s*(?:\[(\d+)\])?\s*q(?:\[(\d+)\])?/i)
    if (declarationMatch) {
      const explicitCount = Number(declarationMatch[1] || declarationMatch[2] || "0")
      qubitCount = Math.max(qubitCount, explicitCount)
    }

    if (/^(OPENQASM|include|qreg|creg|qubit|bit)\b/i.test(line)) {
      continue
    }

    const operationMatch = line.match(/^([a-z_][a-z0-9_]*)/i)
    if (!operationMatch) {
      continue
    }

    const normalizedService =
      CIRCUIT_SERVICE_ALIASES[operationMatch[1].toLowerCase()] ??
      operationMatch[1].toLowerCase()

    serviceCounts[normalizedService] = (serviceCounts[normalizedService] ?? 0) + 1

    const qubitRefs = line.matchAll(/q\[(\d+)\]/g)
    for (const match of qubitRefs) {
      qubitCount = Math.max(qubitCount, Number(match[1]) + 1)
    }
  }

  const format = /OPENQASM\s+3/i.test(circuit)
    ? "OpenQASM 3"
    : /OPENQASM\s+2/i.test(circuit)
      ? "OpenQASM 2"
      : "Unknown"

  const serviceBreakdown = Object.entries(serviceCounts)
    .map(([serviceType, count]) => ({ serviceType, count }))
    .sort((left, right) => right.count - left.count)

  return {
    format,
    qubitCount,
    operationCount: serviceBreakdown.reduce(
      (total, service) => total + service.count,
      0
    ),
    measurementCount: serviceCounts.measurement_feedforward ?? 0,
    serviceBreakdown,
  }
}

export function buildDagModel(plan: PlanResponse | null, job: JobStatusResponse | null) {
  if (!plan) {
    return null
  }

  const resultByFragment = new Map(
    (job?.result?.fragment_results ?? []).map((result) => [result.fragment_id, result])
  )
  const depthCache = new Map<string, number>()

  const getDepth = (fragmentId: string): number => {
    const cachedDepth = depthCache.get(fragmentId)
    if (cachedDepth !== undefined) {
      return cachedDepth
    }

    const fragment = plan.fragments[fragmentId]
    if (!fragment || fragment.dependencies.length === 0) {
      depthCache.set(fragmentId, 0)
      return 0
    }

    const depth =
      Math.max(...fragment.dependencies.map((dependency) => getDepth(dependency))) + 1
    depthCache.set(fragmentId, depth)
    return depth
  }

  const fragmentsByDepth = new Map<number, string[]>()
  for (const fragmentId of plan.fragment_order) {
    const depth = getDepth(fragmentId)
    fragmentsByDepth.set(depth, [
      ...(fragmentsByDepth.get(depth) ?? []),
      fragmentId,
    ])
  }

  const depths = [...fragmentsByDepth.keys()].sort((left, right) => left - right)
  const maxRows = Math.max(...depths.map((depth) => fragmentsByDepth.get(depth)?.length ?? 0))

  const nodeWidth = 284
  const nodeHeight = 132
  const columnGap = 104
  const rowGap = 44
  const padding = 48
  const drawableHeight = maxRows * nodeHeight + Math.max(0, maxRows - 1) * rowGap

  const nodes: DagNode[] = []
  for (const depth of depths) {
    const fragmentIds = fragmentsByDepth.get(depth) ?? []
    const columnHeight =
      fragmentIds.length * nodeHeight + Math.max(0, fragmentIds.length - 1) * rowGap
    const startY = padding + (drawableHeight - columnHeight) / 2

    fragmentIds.forEach((fragmentId, index) => {
      const fragment = plan.fragments[fragmentId]
      const assignment = plan.assignments[fragmentId]
      const runtimeResult = resultByFragment.get(fragmentId)

      nodes.push({
        fragmentId,
        serviceType: fragment.service_type,
        label: formatServiceLabel(fragment.service_type),
        qubits: [...fragment.qubits],
        dependencies: [...fragment.dependencies],
        depth,
        x: padding + depth * (nodeWidth + columnGap),
        y: startY + index * (nodeHeight + rowGap),
        width: nodeWidth,
        height: nodeHeight,
        primaryNodeId: assignment?.primary_node_id ?? null,
        fallbackNodeIds: assignment?.fallback_node_ids ?? [],
        status: runtimeResult?.status ?? null,
        observedFidelity: runtimeResult?.observed_fidelity ?? null,
      })
    })
  }

  const nodesById = Object.fromEntries(nodes.map((node) => [node.fragmentId, node]))
  const edges: DagEdge[] = []
  for (const node of nodes) {
    for (const dependencyId of node.dependencies) {
      const dependency = nodesById[dependencyId]
      if (!dependency) {
        continue
      }

      const fromX = dependency.x + dependency.width
      const fromY = dependency.y + dependency.height / 2
      const toX = node.x
      const toY = node.y + node.height / 2
      const bend = Math.max(48, (toX - fromX) / 2)

      edges.push({
        from: dependencyId,
        to: node.fragmentId,
        path: `M ${fromX} ${fromY} C ${fromX + bend} ${fromY}, ${toX - bend} ${toY}, ${toX} ${toY}`,
      })
    }
  }

  return {
    width: padding * 2 + depths.length * nodeWidth + Math.max(0, depths.length - 1) * columnGap,
    height: padding * 2 + drawableHeight,
    nodes,
    edges,
  } satisfies DagModel
}

export function buildStatevectorRows(statevector: string[] | null | undefined) {
  if (!statevector?.length) {
    return []
  }

  const qubitWidth = Math.max(1, Math.round(Math.log2(statevector.length)))

  return statevector.map((amplitude, index) => ({
    basisState: index.toString(2).padStart(qubitWidth, "0"),
    amplitude,
  }))
}
