import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent,
} from "react"
import "@xyflow/react/dist/style.css"
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import {
  Activity,
  ArrowRight,
  Binary,
  Braces,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Cpu,
  Gauge,
  GitBranch,
  Monitor,
  MoonStar,
  Network,
  Orbit,
  Play,
  RefreshCcw,
  Server,
  Sparkles,
  SunMedium,
  Workflow,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from "recharts"

import { useTheme } from "@/components/theme-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { BlochSphere } from "@/components/BlochSphere"
import { cn } from "@/lib/utils"
import {
  getHealth,
  getJob,
  getJobUpdatesUrl,
  getPlan,
  getServices,
  getFidelityMetrics,
  submitCircuit,
  type CircuitSubmitResponse,
  type FidelityMetricsResponse,
  type JobStatus,
  type JobStatusResponse,
  type JobUpdateResponse,
  type PlanCandidate,
  type PlanResponse,
  type ServiceResponse,
} from "@/lib/quantum-api"
import {
  QUICK_CHECK_CIRCUIT,
  SAMPLE_PIPELINE_CIRCUIT,
  analyzeCircuitText,
  appendStatusLog,
  buildDagModel,
  formatDurationMs,
  formatPercent,
  formatServiceLabel,
  formatTimestamp,
  formatUptimeSeconds,
  groupServicesByNode,
  shortId,
  type DagModel,
  type NetworkNode,
  type StatusLogEntry,
} from "@/lib/quantum-dashboard"

const SERVICE_STYLES: Record<
  string,
  { stroke: string; fill: string; text: string; glow: string }
> = {
  bell_pair: {
    stroke: "#0f766e",
    fill: "rgba(15, 118, 110, 0.14)",
    text: "#0f766e",
    glow: "rgba(20, 184, 166, 0.22)",
  },
  cnot: {
    stroke: "#c2410c",
    fill: "rgba(194, 65, 12, 0.14)",
    text: "#c2410c",
    glow: "rgba(249, 115, 22, 0.2)",
  },
  cz: {
    stroke: "#b45309",
    fill: "rgba(180, 83, 9, 0.14)",
    text: "#b45309",
    glow: "rgba(234, 179, 8, 0.18)",
  },
  controlled_unitary: {
    stroke: "#7c2d12",
    fill: "rgba(124, 45, 18, 0.14)",
    text: "#7c2d12",
    glow: "rgba(194, 65, 12, 0.18)",
  },
  hadamard: {
    stroke: "#0f766e",
    fill: "rgba(13, 148, 136, 0.14)",
    text: "#0f766e",
    glow: "rgba(45, 212, 191, 0.18)",
  },
  programmable_gate: {
    stroke: "#0f172a",
    fill: "rgba(15, 23, 42, 0.12)",
    text: "#0f172a",
    glow: "rgba(71, 85, 105, 0.18)",
  },
  qft: {
    stroke: "#1e3a8a",
    fill: "rgba(30, 58, 138, 0.14)",
    text: "#1e3a8a",
    glow: "rgba(37, 99, 235, 0.18)",
  },
  teleportation: {
    stroke: "#1d4ed8",
    fill: "rgba(29, 78, 216, 0.14)",
    text: "#1d4ed8",
    glow: "rgba(59, 130, 246, 0.18)",
  },
  syndrome_extraction: {
    stroke: "#15803d",
    fill: "rgba(21, 128, 61, 0.14)",
    text: "#15803d",
    glow: "rgba(34, 197, 94, 0.18)",
  },
  distillation: {
    stroke: "#be123c",
    fill: "rgba(190, 18, 60, 0.14)",
    text: "#be123c",
    glow: "rgba(244, 63, 94, 0.18)",
  },
  measurement_feedforward: {
    stroke: "#4338ca",
    fill: "rgba(67, 56, 202, 0.14)",
    text: "#4338ca",
    glow: "rgba(99, 102, 241, 0.18)",
  },
}

const STATUS_STYLES: Record<JobStatus | "STREAM", string> = {
  QUEUED:
    "border-slate-300/60 bg-slate-500/10 text-slate-700 dark:border-slate-500/30 dark:bg-slate-400/10 dark:text-slate-200",
  COMPILING:
    "border-cyan-300/60 bg-cyan-500/10 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-400/10 dark:text-cyan-200",
  RESERVING:
    "border-amber-300/60 bg-amber-500/10 text-amber-700 dark:border-amber-500/30 dark:bg-amber-400/10 dark:text-amber-200",
  EXECUTING:
    "border-violet-300/60 bg-violet-500/10 text-violet-700 dark:border-violet-500/30 dark:bg-violet-400/10 dark:text-violet-200",
  COMPLETED:
    "border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-400/10 dark:text-emerald-200",
  FAILED:
    "border-rose-300/60 bg-rose-500/10 text-rose-700 dark:border-rose-500/30 dark:bg-rose-400/10 dark:text-rose-200",
  STREAM:
    "border-sky-300/60 bg-sky-500/10 text-sky-700 dark:border-sky-500/30 dark:bg-sky-400/10 dark:text-sky-200",
}

const JOB_PHASES: JobStatus[] = [
  "QUEUED",
  "COMPILING",
  "RESERVING",
  "EXECUTING",
  "COMPLETED",
]
const JOB_POLL_INTERVAL_MS = 1000

const nodeChartConfig = {
  fidelity: { label: "Fidelity", color: "#0f766e" },
}

const costChartConfig = {
  totalCost: { label: "Total Cost", color: "#1d4ed8" },
}

const measurementChartConfig = {
  value: { label: "Probability", color: "#c2410c" },
}

const observableChartConfig = {
  value: { label: "Expectation", color: "#15803d" },
}

const FRAGMENT_PAGE_SIZE = 8
const FABRIC_NODE_PAGE_SIZE = 4
const BLOCH_PAGE_SIZE = 4
const ENTROPY_PAGE_SIZE = 8
const STATEVECTOR_PAGE_SIZE = 24
const DENSITY_MATRIX_PAGE_SIZE = 4

interface NodeServiceGroup {
  node: NetworkNode
  advertisements: ServiceResponse[]
  latestUpdatedAt: string | null
}

function getPageCount(totalItems: number, pageSize: number) {
  return Math.max(1, Math.ceil(totalItems / pageSize))
}

function getPageSlice<T>(items: T[], page: number, pageSize: number) {
  const startIndex = (page - 1) * pageSize
  return items.slice(startIndex, startIndex + pageSize)
}

function buildPaginationItems(currentPage: number, pageCount: number) {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, index) => index + 1)
  }

  const pages = new Set<number>([1, currentPage - 1, currentPage, currentPage + 1, pageCount])
  const sortedPages = [...pages]
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((left, right) => left - right)

  const items: Array<number | "ellipsis"> = []
  for (const page of sortedPages) {
    const previousPage = typeof items[items.length - 1] === "number"
      ? (items[items.length - 1] as number)
      : null
    if (previousPage !== null && page - previousPage > 1) {
      items.push("ellipsis")
    }
    items.push(page)
  }

  return items
}

function App() {
  const { theme, setTheme } = useTheme()
  const [health, setHealth] = useState<Awaited<ReturnType<typeof getHealth>> | null>(
    null
  )
  const [services, setServices] = useState<Awaited<ReturnType<typeof getServices>>>(
    []
  )
  const [metricsByNode, setMetricsByNode] = useState<
    Record<string, FidelityMetricsResponse>
  >({})
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [isOverviewLoading, setIsOverviewLoading] = useState(true)
  const [isOverviewRefreshing, setIsOverviewRefreshing] = useState(false)
  const [lastOverviewRefreshAt, setLastOverviewRefreshAt] = useState<string | null>(
    null
  )

  const [circuitText, setCircuitText] = useState(SAMPLE_PIPELINE_CIRCUIT)
  const deferredCircuit = useDeferredValue(circuitText)
  const circuitInsights = useMemo(
    () => analyzeCircuitText(deferredCircuit),
    [deferredCircuit]
  )

  const [trackedJobId, setTrackedJobId] = useState<string | null>(null)
  const [currentJob, setCurrentJob] = useState<JobStatusResponse | null>(null)
  const [currentPlan, setCurrentPlan] = useState<PlanResponse | null>(null)
  const [selectedFragmentId, setSelectedFragmentId] = useState<string | null>(null)
  const [statusHistory, setStatusHistory] = useState<StatusLogEntry[]>([])
  const [jobError, setJobError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isJobSyncing, setIsJobSyncing] = useState(false)
  const [jobConnectionState, setJobConnectionState] = useState<
    "idle" | "connecting" | "live" | "polling"
  >("idle")
  const [fragmentListPage, setFragmentListPage] = useState(1)
  const [fabricNodePage, setFabricNodePage] = useState(1)
  const [blochPage, setBlochPage] = useState(1)
  const [entropyPage, setEntropyPage] = useState(1)
  const [statevectorPage, setStatevectorPage] = useState(1)
  const [densityMatrixPage, setDensityMatrixPage] = useState(1)
  const activeJobSyncAbortRef = useRef<AbortController | null>(null)

  const networkNodes = useMemo(
    () => groupServicesByNode(services, metricsByNode),
    [services, metricsByNode]
  )
  const serviceGroups = useMemo<NodeServiceGroup[]>(() => {
    return networkNodes.map((node) => {
      const advertisements = services
        .filter((service) => service.node_id === node.nodeId)
        .sort((left, right) => left.service_type.localeCompare(right.service_type))

      const latestUpdatedAt = advertisements.reduce<string | null>((latest, service) => {
        if (!latest || service.updated_at > latest) {
          return service.updated_at
        }

        return latest
      }, null)

      return {
        node,
        advertisements,
        latestUpdatedAt,
      }
    })
  }, [networkNodes, services])
  const latestServiceUpdateAt = useMemo(() => {
    return services.reduce<string | null>((latest, service) => {
      if (!latest || service.updated_at > latest) {
        return service.updated_at
      }

      return latest
    }, null)
  }, [services])
  const selectedNode =
    networkNodes.find((node) => node.nodeId === selectedNodeId) ??
    networkNodes[0] ??
    null
  const fragmentIds = currentPlan?.fragment_order ?? []
  const fragmentListPageCount = getPageCount(fragmentIds.length, FRAGMENT_PAGE_SIZE)
  const visibleFragmentIds = getPageSlice(
    fragmentIds,
    fragmentListPage,
    FRAGMENT_PAGE_SIZE
  )
  const visibleFragmentStartIndex = (fragmentListPage - 1) * FRAGMENT_PAGE_SIZE
  const fabricNodePageCount = getPageCount(networkNodes.length, FABRIC_NODE_PAGE_SIZE)
  const visibleNetworkNodes = getPageSlice(
    networkNodes,
    fabricNodePage,
    FABRIC_NODE_PAGE_SIZE
  )
  const dagModel = useMemo(() => buildDagModel(currentPlan, currentJob), [
    currentPlan,
    currentJob,
  ])

  const resolvedFragmentId = selectedFragmentId ?? currentPlan?.fragment_order[0] ?? null
  const selectedFragment = resolvedFragmentId
    ? currentPlan?.fragments[resolvedFragmentId] ?? null
    : null
  const selectedAssignment = selectedFragment
    ? currentPlan?.assignments[selectedFragment.fragment_id] ?? null
    : null
  const selectedResult =
    currentJob?.result?.fragment_results.find(
      (result) => result.fragment_id === selectedFragment?.fragment_id
    ) ?? null

  const quantumResult = currentJob?.result?.quantum_result ?? null
  const fragmentProgress = currentJob?.progress ?? null
  const lifecycleStatus = currentJob?.status ?? statusHistory[statusHistory.length - 1]?.status
  const isTerminalJob =
    currentJob?.status === "COMPLETED" || currentJob?.status === "FAILED"
  const lifecycleProgress = (() => {
    if (!lifecycleStatus) {
      return 0
    }

    const phaseIndex = Math.max(JOB_PHASES.indexOf(lifecycleStatus), 0)
    if (lifecycleStatus === "EXECUTING" && fragmentProgress?.total_fragments) {
      const phaseStart = (phaseIndex / JOB_PHASES.length) * 100
      const phaseEnd = ((phaseIndex + 1) / JOB_PHASES.length) * 100
      return phaseStart + (phaseEnd - phaseStart) * fragmentProgress.completion_ratio
    }

    return ((phaseIndex + 1) / JOB_PHASES.length) * 100
  })()
  const recentStatusEntries = statusHistory.slice(-5).reverse()
  const lifecycleDetail =
    lifecycleStatus === "EXECUTING" && fragmentProgress
      ? fragmentProgress.finalizing
        ? `All ${fragmentProgress.total_fragments} fragments executed. Building the quantum result bundle now.`
        : `${fragmentProgress.completed_fragments} of ${fragmentProgress.total_fragments} fragments executed${fragmentProgress.active_fragments > 0 ? `, ${fragmentProgress.active_fragments} in flight` : ""}.`
      : lifecycleStatus
        ? `Current stage: ${lifecycleStatus}`
        : "Submit a circuit to light up the execution phases."
  const streamPulseValue =
    jobConnectionState === "live"
      ? "WebSocket live"
      : jobConnectionState === "polling"
        ? "Polling fallback"
        : trackedJobId
          ? "Connecting"
          : "Idle"
  const streamPulseTone =
    jobConnectionState === "live"
      ? "success"
      : jobConnectionState === "polling"
        ? "warning"
        : "info"
  const pulseHeadline =
    health?.status !== "ok"
      ? "Coordinator signal is reconnecting"
      : trackedJobId
        ? isTerminalJob
          ? currentJob?.status === "COMPLETED"
            ? "Execution completed cleanly"
            : "Execution ended with attention needed"
          : jobConnectionState === "live"
            ? "Live execution telemetry is flowing"
            : "Execution telemetry is syncing"
        : "Fabric is ready for the next launch"
  const pulseDescription =
    health?.status !== "ok"
      ? "The health endpoint is not responding yet. Once it comes back, live service discovery and execution telemetry will resume automatically."
      : trackedJobId
        ? lifecycleStatus === "EXECUTING" && fragmentProgress
          ? fragmentProgress.finalizing
            ? `${health.service} finished executing ${fragmentProgress.total_fragments} routed fragments and is finalizing probabilities, observables, and state analysis.`
            : `${health.service} is executing ${fragmentProgress.completed_fragments} of ${fragmentProgress.total_fragments} routed fragments across ${serviceGroups.length} visible peers.`
          : currentPlan
            ? `${health.service} is tracking ${currentPlan.fragment_order.length} routed fragments across ${serviceGroups.length} visible peers.`
            : `${health.service} is tracking ${shortId(trackedJobId, 10, 5)} and preparing the execution surfaces.`
        : `${health.service} is online with ${serviceGroups.length} visible peers and refreshes the fabric view every 12 seconds.`

  const refreshOverview = async (intent: "initial" | "background") => {
    if (intent === "initial") {
      setIsOverviewLoading(true)
    } else {
      setIsOverviewRefreshing(true)
    }

    try {
      const [nextHealth, nextServices] = await Promise.all([getHealth(), getServices()])
      const nodeIds = Array.from(new Set(nextServices.map((service) => service.node_id)))
      const metricResults = await Promise.allSettled(
        nodeIds.map((nodeId) => getFidelityMetrics(nodeId))
      )

      const nextMetrics: Record<string, FidelityMetricsResponse> = {}
      for (const result of metricResults) {
        if (result.status === "fulfilled") {
          nextMetrics[result.value.node_id] = result.value
        }
      }

      const nextNodes = groupServicesByNode(nextServices, nextMetrics)

      startTransition(() => {
        setHealth(nextHealth)
        setServices(nextServices)
        setMetricsByNode(nextMetrics)
        setLastOverviewRefreshAt(new Date().toISOString())
        setOverviewError(null)
        setSelectedNodeId((currentNodeId) => {
          if (currentNodeId && nextNodes.some((node) => node.nodeId === currentNodeId)) {
            return currentNodeId
          }

          return nextNodes[0]?.nodeId ?? null
        })
      })
    } catch (error) {
      setOverviewError(getErrorMessage(error))
    } finally {
      setIsOverviewLoading(false)
      setIsOverviewRefreshing(false)
    }
  }

  const syncJob = useEffectEvent(
    async (
      jobId: string,
      source: "poll" | "stream",
      signal?: AbortSignal
    ) => {
      if (signal?.aborted) {
        return
      }

      setIsJobSyncing(true)

      try {
        const nextJob = await getJob(jobId, signal)
        if (signal?.aborted || trackedJobId !== jobId) {
          return
        }

        let nextPlan = currentPlan

        if (nextJob.plan_id && (!nextPlan || nextPlan.plan_id !== nextJob.plan_id)) {
          nextPlan = await getPlan(nextJob.plan_id, signal)
        }

        if (signal?.aborted || trackedJobId !== jobId) {
          return
        }

        startTransition(() => {
          setCurrentJob(nextJob)
          setJobError(nextJob.error)
          setStatusHistory((currentEntries) =>
            appendStatusLog(currentEntries, {
              status: nextJob.status,
              recordedAt: nextJob.updated_at,
              source,
            })
          )

          if (nextPlan) {
            setCurrentPlan(nextPlan)
            setSelectedFragmentId((currentFragmentId) => {
              if (
                currentFragmentId &&
                nextPlan.fragment_order.includes(currentFragmentId)
              ) {
                return currentFragmentId
              }

              return nextPlan.fragment_order[0] ?? null
            })
          }
        })

        if (nextJob.status === "COMPLETED") {
          void refreshOverview("background")
        }
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return
        }

        setJobError(getErrorMessage(error))
        setJobConnectionState("polling")
      } finally {
        if (!signal?.aborted) {
          setIsJobSyncing(false)
        }
      }
    }
  )

  useEffect(() => {
    void refreshOverview("initial")

    const intervalId = window.setInterval(() => {
      void refreshOverview("background")
    }, 12000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    if (selectedNodeId || networkNodes.length === 0) {
      return
    }

    setSelectedNodeId(networkNodes[0].nodeId)
  }, [networkNodes, selectedNodeId])

  useEffect(() => {
    setFragmentListPage((currentPage) => Math.min(currentPage, fragmentListPageCount))
  }, [fragmentListPageCount])

  useEffect(() => {
    setFabricNodePage((currentPage) => Math.min(currentPage, fabricNodePageCount))
  }, [fabricNodePageCount])

  useEffect(() => {
    if (!selectedFragmentId) {
      return
    }

    const selectedIndex = fragmentIds.indexOf(selectedFragmentId)
    if (selectedIndex < 0) {
      return
    }

    const nextPage = Math.floor(selectedIndex / FRAGMENT_PAGE_SIZE) + 1
    setFragmentListPage((currentPage) => (currentPage === nextPage ? currentPage : nextPage))
  }, [fragmentIds, selectedFragmentId])

  useEffect(() => {
    if (!selectedNodeId) {
      return
    }

    const selectedIndex = networkNodes.findIndex((node) => node.nodeId === selectedNodeId)
    if (selectedIndex < 0) {
      return
    }

    const nextPage = Math.floor(selectedIndex / FABRIC_NODE_PAGE_SIZE) + 1
    setFabricNodePage((currentPage) => (currentPage === nextPage ? currentPage : nextPage))
  }, [networkNodes, selectedNodeId])

  useEffect(() => {
    if (!trackedJobId || isTerminalJob) {
      return
    }

    let isActive = true
    let websocket: WebSocket | null = null
    const abortController = new AbortController()
    activeJobSyncAbortRef.current?.abort()
    activeJobSyncAbortRef.current = abortController

    setJobConnectionState("connecting")
    void syncJob(trackedJobId, "poll", abortController.signal)

    const intervalId = window.setInterval(() => {
      void syncJob(trackedJobId, "poll", abortController.signal)
    }, JOB_POLL_INTERVAL_MS)

    try {
      websocket = new WebSocket(getJobUpdatesUrl(trackedJobId))
      websocket.onopen = () => {
        if (isActive) {
          setJobConnectionState("live")
        }
      }
      websocket.onmessage = (event) => {
        if (!isActive) {
          return
        }

        const payload = JSON.parse(event.data) as JobUpdateResponse
        startTransition(() => {
          setStatusHistory((currentEntries) =>
            appendStatusLog(currentEntries, {
              status: payload.status,
              recordedAt: payload.updated_at,
              source: "stream",
            })
          )
        })
        void syncJob(trackedJobId, "stream", abortController.signal)
      }
      websocket.onerror = () => {
        if (isActive) {
          setJobConnectionState("polling")
        }
      }
      websocket.onclose = () => {
        if (isActive && !isTerminalJob) {
          setJobConnectionState("polling")
        }
      }
    } catch {
      setJobConnectionState("polling")
    }

    return () => {
      isActive = false
      window.clearInterval(intervalId)
      abortController.abort()
      if (activeJobSyncAbortRef.current === abortController) {
        activeJobSyncAbortRef.current = null
      }
      websocket?.close()
    }
  }, [trackedJobId, isTerminalJob])

  const handleSubmit = async () => {
    if (!circuitText.trim()) {
      setJobError("Add a circuit before launching a job.")
      return
    }

    setIsSubmitting(true)
    setJobError(null)

    try {
      const response = await submitCircuit(circuitText)
      applySubmittedJob(response)
    } catch (error) {
      setJobError(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const applySubmittedJob = (response: CircuitSubmitResponse) => {
    activeJobSyncAbortRef.current?.abort()
    setFragmentListPage(1)
    setBlochPage(1)
    setEntropyPage(1)
    setStatevectorPage(1)
    setDensityMatrixPage(1)

    startTransition(() => {
      setTrackedJobId(response.job_id)
      setCurrentJob(null)
      setCurrentPlan(null)
      setSelectedFragmentId(null)
      setStatusHistory([
        {
          status: response.status,
          recordedAt: new Date().toISOString(),
          source: "submit",
        },
      ])
      setJobConnectionState("connecting")
    })
  }

  const countsData = Object.entries(quantumResult?.counts ?? {}).map(([state, count]) => ({
    state,
    value: count,
  }))
  const measuredProbabilityData = Object.entries(
    quantumResult?.measured_probabilities ?? {}
  ).map(([state, value]) => ({
    state,
    value,
  }))
  const observableData = Object.entries(
    quantumResult?.observable_expectations ?? {}
  ).map(([observable, value]) => ({
    observable,
    value,
  }))
  const topBasisData = (quantumResult?.top_basis_states ?? []).map((state) => ({
    state: state.basis_state,
    value: state.probability,
  }))
  const blochData = Object.entries(quantumResult?.bloch_vectors ?? {})
    .map(([qubit, vector]) => {
      const raw = vector as Record<string, unknown>
      const num = (v: unknown) => (typeof v === "number" && !Number.isNaN(v) ? v : 0)
      return {
        qubit,
        x: num(raw.x ?? raw.X ?? 0),
        y: num(raw.y ?? raw.Y ?? 0),
        z: num(raw.z ?? raw.Z ?? 0),
      }
    })
    .sort((a, b) => {
      const idxA = parseInt(a.qubit.replace(/^q/, ""), 10)
      const idxB = parseInt(b.qubit.replace(/^q/, ""), 10)
      if (!Number.isNaN(idxA) && !Number.isNaN(idxB)) return idxA - idxB
      return String(a.qubit).localeCompare(String(b.qubit))
    })
  const entropyRaw = quantumResult?.entanglement_entropy ?? {}
  const entropyData = Object.entries(entropyRaw)
    .map(([label, value]) => ({
      label,
      value: typeof value === "number" && !Number.isNaN(value) ? value : 0,
    }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label)))
  const allEntropyZero =
    entropyData.length > 0 && entropyData.every((e) => e.value === 0)
  const blochPageCount = getPageCount(blochData.length, BLOCH_PAGE_SIZE)
  const visibleBlochData = getPageSlice(blochData, blochPage, BLOCH_PAGE_SIZE)
  const entropyPageCount = getPageCount(entropyData.length, ENTROPY_PAGE_SIZE)
  const visibleEntropyData = getPageSlice(entropyData, entropyPage, ENTROPY_PAGE_SIZE)
  const statevectorValues = quantumResult?.statevector ?? []
  const statevectorPageCount = getPageCount(statevectorValues.length, STATEVECTOR_PAGE_SIZE)
  const statevectorStartIndex = (statevectorPage - 1) * STATEVECTOR_PAGE_SIZE
  const statevectorRows = useMemo(() => {
    if (!statevectorValues.length) {
      return []
    }

    const qubitWidth = Math.max(1, Math.round(Math.log2(statevectorValues.length)))
    return statevectorValues
      .slice(statevectorStartIndex, statevectorStartIndex + STATEVECTOR_PAGE_SIZE)
      .map((amplitude, index) => ({
        basisState: (statevectorStartIndex + index).toString(2).padStart(qubitWidth, "0"),
        amplitude,
      }))
  }, [statevectorStartIndex, statevectorValues])
  const densityMatrixEntries = Object.entries(quantumResult?.reduced_density_matrices ?? {})
  const densityMatrixPageCount = getPageCount(
    densityMatrixEntries.length,
    DENSITY_MATRIX_PAGE_SIZE
  )
  const visibleDensityMatrixEntries = getPageSlice(
    densityMatrixEntries,
    densityMatrixPage,
    DENSITY_MATRIX_PAGE_SIZE
  )
  const candidateData = (selectedAssignment?.candidates ?? []).map(
    (candidate: PlanCandidate) => ({
      node: shortId(candidate.node_id, 8, 4),
      totalCost: Number(candidate.total_cost.toFixed(3)),
      fullNodeId: candidate.node_id,
      fidelity: candidate.fidelity,
      isPrimary: selectedAssignment?.primary_node_id === candidate.node_id,
    })
  )
  const averageNodeFidelity =
    networkNodes.reduce((total, node) => total + node.averageFidelity, 0) /
    Math.max(networkNodes.length, 1)

  useEffect(() => {
    setBlochPage((currentPage) => Math.min(currentPage, blochPageCount))
  }, [blochPageCount])

  useEffect(() => {
    setEntropyPage((currentPage) => Math.min(currentPage, entropyPageCount))
  }, [entropyPageCount])

  useEffect(() => {
    setStatevectorPage((currentPage) => Math.min(currentPage, statevectorPageCount))
  }, [statevectorPageCount])

  useEffect(() => {
    setDensityMatrixPage((currentPage) => Math.min(currentPage, densityMatrixPageCount))
  }, [densityMatrixPageCount])

  return (
    <div className="quantum-shell relative min-h-svh overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.18),transparent_26%),radial-gradient(circle_at_88%_10%,rgba(249,115,22,0.15),transparent_24%),radial-gradient(circle_at_50%_78%,rgba(59,130,246,0.12),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-[-18rem] -z-10 mx-auto h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgba(15,118,110,0.25),transparent_64%)] blur-3xl animate-orbit-slow" />
      <div className="pointer-events-none absolute right-[-10rem] top-[20rem] -z-10 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(194,65,12,0.18),transparent_64%)] blur-3xl animate-float-slow" />

      <header className="sticky top-0 z-40 border-b border-white/40 bg-background/65 backdrop-blur-2xl dark:border-white/8">
        <div className="mx-auto flex max-w-[96rem] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-white/60 bg-white/80 text-primary shadow-[0_24px_50px_-28px_rgba(15,118,110,0.55)] dark:border-white/10 dark:bg-white/6">
              <Orbit className="size-5 animate-spin-slow" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                Distributed Quantum Services
              </p>
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                Quantum Fabric Control Plane
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => scrollToSection("fabric")}
            >
              <Network className="size-4" />
              Fabric
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => scrollToSection("execution")}
            >
              <Workflow className="size-4" />
              Execution
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => scrollToSection("analysis")}
            >
              <Sparkles className="size-4" />
              Analysis
            </Button>
            <ThemeSwitch theme={theme} setTheme={setTheme} />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-[96rem] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <section className="space-y-6">
          <Card className="glass-panel relative overflow-hidden border-white/60 bg-white/72 shadow-[0_40px_120px_-56px_rgba(15,118,110,0.45)] dark:border-white/10 dark:bg-[#09121f]/78">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(20,184,166,0.18),transparent_28%),radial-gradient(circle_at_86%_12%,rgba(249,115,22,0.16),transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.32),transparent_54%)]" />
            <div className="pointer-events-none absolute -left-16 top-12 h-72 w-72 rounded-full bg-teal-500/12 blur-3xl dark:bg-teal-400/10" />
            <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl dark:bg-amber-400/8" />

            <div className="relative flex flex-col gap-8 px-6 py-7 sm:px-8 sm:py-8 xl:px-10 xl:py-10">
              <div className="flex flex-col gap-8">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    <Activity className="size-3.5" />
                    Live orchestration
                  </Badge>
                  <StatusPill status={lifecycleStatus ?? "QUEUED"} label={lifecycleStatus} />
                  {trackedJobId ? (
                    <Badge
                      variant="outline"
                      className="rounded-full px-3 py-1 font-mono text-[11px]"
                    >
                      {shortId(trackedJobId, 11, 6)}
                    </Badge>
                  ) : null}
                </div>

                <div className="max-w-4xl space-y-4">
                  <CardTitle className="text-4xl leading-[1.02] tracking-tight text-balance sm:text-5xl xl:text-6xl">
                    Distributed quantum execution staged as a living control
                    surface.
                  </CardTitle>
                  <CardDescription className="max-w-3xl text-base leading-7 text-foreground/70 sm:text-lg">
                    Launch a circuit, watch it fracture into routed fragments,
                    follow the service fabric in motion, and inspect the final
                    quantum state without squeezing critical context into tiny
                    boxes.
                  </CardDescription>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <MetricTile
                    icon={Server}
                    label="Active nodes"
                    value={`${networkNodes.length}`}
                    hint={`${services.length} capability ads`}
                    accent="teal"
                  />
                  <MetricTile
                    icon={Gauge}
                    label="Average fidelity"
                    value={formatPercent(averageNodeFidelity)}
                    hint={
                      selectedNode
                        ? `Lead node ${selectedNode.shortId}`
                        : "Waiting for services"
                    }
                    accent="amber"
                  />
                  <MetricTile
                    icon={Clock3}
                    label="Coordinator uptime"
                    value={formatUptimeSeconds(health?.uptime_seconds)}
                    hint={health ? `${health.environment} / v${health.version}` : "Connecting"}
                    accent="blue"
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-[1.8rem] border border-white/55 bg-white/64 p-5 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.28)] dark:border-white/10 dark:bg-white/6">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                          Execution arc
                        </p>
                        <p className="mt-1 text-sm text-foreground/72">
                          Planner to runtime progression for the active workflow.
                        </p>
                      </div>
                      {isJobSyncing ? (
                        <Badge variant="outline" className="rounded-full px-3 py-1">
                          <RefreshCcw className="size-3 animate-spin" />
                          Syncing
                        </Badge>
                      ) : null}
                    </div>
                    <LifecycleRail currentStatus={lifecycleStatus} />
                    <div className="mt-4 flex flex-wrap gap-2">
                      {statusHistory.slice(-4).map((entry) => (
                        <Badge
                          key={`${entry.status}-${entry.recordedAt}`}
                          variant="outline"
                          className={cn(
                            "rounded-full px-3 py-1",
                            STATUS_STYLES[entry.source === "stream" ? "STREAM" : entry.status]
                          )}
                        >
                          {entry.status}
                        </Badge>
                      ))}
                      {statusHistory.length === 0 ? (
                        <Badge variant="outline" className="rounded-full px-3 py-1">
                          Awaiting first launch
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-[1.8rem] border border-white/55 bg-white/64 p-5 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.28)] dark:border-white/10 dark:bg-white/6">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Live link
                    </p>
                    <div className="mt-4 space-y-4">
                      <HeroMiniStat
                        label="Tracked job"
                        value={
                          trackedJobId ? shortId(trackedJobId, 12, 5) : "No active job"
                        }
                        detail={trackedJobId ?? "Submit a circuit to start the live stream"}
                      />
                      {/* <HeroMiniStat
                        label="Selected node"
                        value={selectedNode?.shortId ?? "Not selected"}
                        detail={
                          selectedNode
                            ? `${formatPercent(selectedNode.averageFidelity)} average fidelity`
                            : "Fabric selection appears after service discovery"
                        }
                      /> */}
                      {/* <HeroMiniStat
                        label="Last fabric refresh"
                        value={
                          lastOverviewRefreshAt
                            ? formatTimestamp(lastOverviewRefreshAt)
                            : "--"
                        }
                        detail={
                          currentPlan
                            ? `${currentPlan.fragment_order.length} routed fragments loaded`
                            : "Plan graph appears after compile"
                        }
                      /> */}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="glass-panel border-white/60 bg-white/72 dark:border-white/10 dark:bg-[#09121f]/78">
            <CardHeader className="gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionTitle
                  icon={Network}
                  eyebrow="Registry"
                  title="Live Service Mesh"
                  description="A visual map of the active quantum peers so you can understand who is online, what each node can execute, and how the fabric is connected."
                />
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    {services.length} records
                  </Badge>
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    {serviceGroups.length} active peers
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ServiceBroadcastBoard
                serviceGroups={serviceGroups}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
                latestServiceUpdateAt={latestServiceUpdateAt}
              />
            </CardContent>
          </Card>

          <Card className="glass-panel overflow-hidden border-white/60 bg-white/72 dark:border-white/10 dark:bg-[#09121f]/78">
            <CardHeader className="gap-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <SectionTitle
                  icon={Activity}
                  eyebrow="Telemetry"
                  title="System Pulse"
                  description="Live coordinator, transport, and execution signals collected from the current fabric state."
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => void refreshOverview("background")}
                  disabled={isOverviewRefreshing}
                >
                  <RefreshCcw
                    className={cn("size-4", isOverviewRefreshing && "animate-spin")}
                  />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr] xl:items-start">
              <div className="relative overflow-hidden rounded-[2.2rem] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.82),rgba(255,255,255,0.52))] p-5 shadow-[0_38px_90px_-54px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(10,18,31,0.94),rgba(12,25,42,0.84))] sm:p-6">
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute -left-12 top-8 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.18),transparent_72%)] blur-2xl" />
                  <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.14),transparent_72%)] blur-3xl" />
                  <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.12),transparent_70%)] blur-3xl" />
                </div>
                <div className="relative flex flex-col gap-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill
                      status={lifecycleStatus ?? "QUEUED"}
                      label={lifecycleStatus ? `${lifecycleStatus} phase` : "Waiting for workflow"}
                      className={
                        lifecycleStatus
                          ? undefined
                          : "border-white/60 bg-white/78 text-foreground/72 dark:border-white/10 dark:bg-white/8 dark:text-slate-200"
                      }
                    />
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/76 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-foreground/72 dark:border-white/10 dark:bg-white/8 dark:text-slate-200">
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          health?.status === "ok"
                            ? "bg-emerald-500 animate-pulse"
                            : "bg-amber-500"
                        )}
                      />
                      {health?.status === "ok" ? "Coordinator live" : "Signal degraded"}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                      {pulseHeadline}
                    </h2>
                    <p className="mt-2 text-sm leading-7 text-foreground/70 sm:mt-3">
                      {pulseDescription}
                    </p>
                  </div>

                  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <PulseStat
                      icon={Server}
                      label="Coordinator"
                      value={health?.status === "ok" ? "Healthy" : "Reconnecting"}
                      detail={health ? health.service : "Coordinator unreachable"}
                      tone={health?.status === "ok" ? "success" : "warning"}
                    />
                    <PulseStat
                      icon={Orbit}
                      label="Transport"
                      value={streamPulseValue}
                      detail={
                        trackedJobId
                          ? `Tracking ${shortId(trackedJobId, 10, 5)}`
                          : "Submit a circuit to start a run"
                      }
                      tone={streamPulseTone}
                    />
                    <PulseStat
                      icon={Clock3}
                      label="Heartbeat"
                      value={
                        lastOverviewRefreshAt
                          ? formatTimestamp(lastOverviewRefreshAt)
                          : "Awaiting sync"
                      }
                      detail={
                        isOverviewRefreshing
                          ? "Refreshing coordinator and service state now"
                          : "Background refresh cadence: 12 seconds"
                      }
                      tone={overviewError ? "warning" : isOverviewRefreshing ? "info" : "success"}
                    />
                    <PulseStat
                      icon={Gauge}
                      label="Fabric"
                      value={formatUptimeSeconds(health?.uptime_seconds)}
                      detail={`${serviceGroups.length} visible peers in the current registry sweep`}
                      tone={serviceGroups.length > 0 ? "success" : "info"}
                    />
                  </div>

                  <div className="mt-5 min-w-0 rounded-[1.7rem] border border-white/60 bg-white/66 p-4 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.25)] dark:border-white/10 dark:bg-white/6 xl:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                          Lifecycle progress
                        </div>
                        <div className="mt-1 text-sm text-foreground/68">
                          {lifecycleDetail}
                        </div>
                      </div>
                      <div className="rounded-full border border-white/60 bg-white/80 px-3 py-1 text-sm font-semibold dark:border-white/10 dark:bg-white/8">
                        {Math.round(lifecycleProgress)}%
                      </div>
                    </div>
                    <Progress
                      value={lifecycleProgress}
                      className="mt-4 h-2.5 bg-white/70 dark:bg-white/8"
                    />
                    {fragmentProgress ? (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-foreground/65">
                        <span className="rounded-full border border-white/55 px-2.5 py-1 dark:border-white/10">
                          {fragmentProgress.completed_fragments}/{fragmentProgress.total_fragments} fragments
                        </span>
                        {fragmentProgress.active_fragments > 0 ? (
                          <span className="rounded-full border border-white/55 px-2.5 py-1 dark:border-white/10">
                            {fragmentProgress.active_fragments} active
                          </span>
                        ) : null}
                        {fragmentProgress.latest_event_at ? (
                          <span className="rounded-full border border-white/55 px-2.5 py-1 dark:border-white/10">
                            Last fragment update {formatTimestamp(fragmentProgress.latest_event_at)}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-4">
                      <LifecycleRail currentStatus={lifecycleStatus} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="rounded-[2rem] border border-white/55 bg-white/72 p-5 shadow-[0_26px_70px_-44px_rgba(15,23,42,0.32)] dark:border-white/10 dark:bg-[#0d1828]/84">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        Recent signals
                      </div>
                      <div className="mt-1 text-sm leading-6 text-foreground/68">
                        The latest execution and transport events arriving from the runtime.
                      </div>
                    </div>
                    <Badge variant="outline" className="rounded-full px-3 py-1">
                      {recentStatusEntries.length > 0
                        ? `${recentStatusEntries.length} events`
                        : "Standby"}
                    </Badge>
                  </div>

                  {recentStatusEntries.length > 0 ? (
                    <div className="mt-5 space-y-3">
                      {recentStatusEntries.map((entry, index) => (
                        <div
                          key={`${entry.status}-${entry.recordedAt}-${index}`}
                          className="rounded-[1.4rem] border border-white/50 bg-white/70 p-3 dark:border-white/8 dark:bg-white/6"
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={cn(
                                "flex size-10 shrink-0 items-center justify-center rounded-2xl border",
                                STATUS_STYLES[
                                entry.source === "stream" ? "STREAM" : entry.status
                                ]
                              )}
                            >
                              <span className="size-2.5 rounded-full bg-current opacity-85" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusPill status={entry.status} />
                                <span className="rounded-full border border-white/55 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-foreground/62 dark:border-white/10">
                                  {entry.source === "stream" ? "stream" : "poll"}
                                </span>
                              </div>
                              <div className="mt-2 text-sm text-foreground/72">
                                {formatTimestamp(entry.recordedAt)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4">
                      <EmptyHint
                        icon={Activity}
                        title="No active workflow yet"
                        description="Submit a circuit to populate the live execution timeline and plan graph."
                      />
                    </div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniDataCard
                    label="Active job"
                    value={trackedJobId ? shortId(trackedJobId, 14, 7) : "--"}
                    detail={trackedJobId ?? "No workflow is being tracked yet"}
                  />
                  <MiniDataCard
                    label="Selected peer"
                    value={selectedNode?.shortId ?? "--"}
                    detail={
                      selectedNode
                        ? `${selectedNode.serviceTypes.length} service types in focus`
                        : "Peer focus appears after service discovery"
                    }
                  />
                </div>

                {jobError ? (
                  <InlineAlert tone="error" title="Job signal" description={jobError} />
                ) : null}
                {overviewError ? (
                  <InlineAlert
                    tone="warning"
                    title="Fabric refresh"
                    description={overviewError}
                  />
                ) : null}
              </div>
            </CardContent>
          </Card>
        </section>

        <section id="command" className="grid gap-6 xl:grid-cols-[1fr_1fr] xl:min-w-0">
          <Card className="glass-panel border-white/60 bg-white/76 dark:border-white/10 dark:bg-[#09121f]/78">
            <CardHeader className="gap-3">
              <SectionTitle
                icon={Braces}
                eyebrow="Command"
                title="Circuit Composer"
                description="Shape the workload before launch, with live sizing hints driven by the actual parser surface."
              />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="rounded-[1.8rem] border border-white/55 bg-white/64 p-4 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.22)] dark:border-white/10 dark:bg-white/6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Launch Pad
                    </div>
                    <div className="mt-1 text-sm leading-6 text-foreground/68">
                      Load a curated circuit into the editor or execute the one that
                      is currently staged here.
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      size="lg"
                      className="rounded-full px-5 shadow-[0_18px_48px_-26px_rgba(15,118,110,0.65)]"
                      onClick={() => void handleSubmit()}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <RefreshCcw className="size-4 animate-spin" />
                      ) : (
                        <Play className="size-4" />
                      )}
                      Launch workflow
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="rounded-full px-5"
                      onClick={() => setCircuitText(SAMPLE_PIPELINE_CIRCUIT)}
                    >
                      <Workflow className="size-4" />
                      Load pipeline circuit
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="rounded-full px-5"
                      onClick={() => setCircuitText(QUICK_CHECK_CIRCUIT)}
                    >
                      <Binary className="size-4" />
                      Quick smoke check
                    </Button>
                  </div>
                </div>
              </div>

              <Textarea
                value={circuitText}
                onChange={(event) => setCircuitText(event.target.value)}
                spellCheck={false}
                className="min-h-[26rem] rounded-3xl border-white/50 bg-white/60 font-mono text-[13px] leading-6 shadow-inner shadow-black/5 dark:border-white/8 dark:bg-black/15"
              />

              <div className="grid gap-3 md:grid-cols-4">
                <InsightTile
                  label="Format"
                  value={circuitInsights.format}
                  icon={Binary}
                />
                <InsightTile
                  label="Qubits"
                  value={`${circuitInsights.qubitCount || 0}`}
                  icon={Cpu}
                />
                <InsightTile
                  label="Operations"
                  value={`${circuitInsights.operationCount}`}
                  icon={Workflow}
                />
                <InsightTile
                  label="Measurements"
                  value={`${circuitInsights.measurementCount}`}
                  icon={Gauge}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {circuitInsights.serviceBreakdown.map((service) => (
                  <ServiceChip
                    key={service.serviceType}
                    serviceType={service.serviceType}
                    value={`${service.count}x`}
                  />
                ))}
                {circuitInsights.serviceBreakdown.length === 0 ? (
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    Waiting for gate instructions
                  </Badge>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-white/60 bg-white/76 dark:border-white/10 dark:bg-[#09121f]/78">
            <CardHeader>
              <SectionTitle
                icon={Sparkles}
                eyebrow="Overview"
                title="Run Snapshot"
                description="High-signal context for the latest workload without compressing everything into a single panel."
              />
            </CardHeader>
            <CardContent className="flex flex-col gap-5 min-w-0 overflow-x-auto">
              <div className="grid gap-3 md:grid-cols-2 min-w-[280px]">
                <RunSummaryTile
                  label="Job ID"
                  value={trackedJobId ? shortId(trackedJobId, 14, 7) : "--"}
                  detail={trackedJobId ?? "No job submitted yet"}
                />
                <RunSummaryTile
                  label="Plan ID"
                  value={currentJob?.plan_id ? shortId(currentJob.plan_id, 14, 7) : "--"}
                  detail={currentJob?.plan_id ?? "Plan appears after compile"}
                />
                <RunSummaryTile
                  label="Fragments"
                  value={`${currentPlan?.fragment_order.length ?? 0}`}
                  detail="Execution units in the routing graph"
                />
                <RunSummaryTile
                  label="Shots"
                  value={`${quantumResult?.shots ?? 0}`}
                  detail="Result sampling depth"
                />
              </div>

              <Separator />

              <div className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
                <div className="rounded-3xl border border-white/50 bg-white/65 p-4 dark:border-white/8 dark:bg-black/15">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <GitBranch className="size-4 text-primary" />
                    Planner coverage
                  </div>
                  <div className="space-y-3">
                    {visibleFragmentIds.map((fragmentId, index) => {
                      const fragment = currentPlan?.fragments[fragmentId]
                      if (!fragment) {
                        return null
                      }

                      return (
                        <button
                          key={fragmentId}
                          type="button"
                          onClick={() => setSelectedFragmentId(fragmentId)}
                          className={cn(
                            "flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition-colors",
                            selectedFragment?.fragment_id === fragmentId
                              ? "border-primary/30 bg-primary/6"
                              : "border-white/60 bg-white/50 hover:border-primary/20 hover:bg-white/80 dark:border-white/8 dark:bg-white/4 dark:hover:bg-white/8"
                          )}
                        >
                          <div className="min-w-0">
                            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                              Fragment {visibleFragmentStartIndex + index + 1}
                            </p>
                            <p className="truncate text-sm font-medium">
                              {formatServiceLabel(fragment.service_type)}
                            </p>
                          </div>
                          <Badge variant="outline" className="rounded-full">
                            q{fragment.qubits.join(", ")}
                          </Badge>
                        </button>
                      )
                    })}
                    <SectionPagination
                      page={fragmentListPage}
                      pageCount={fragmentListPageCount}
                      pageSize={FRAGMENT_PAGE_SIZE}
                      totalItems={fragmentIds.length}
                      itemLabel="fragments"
                      onPageChange={setFragmentListPage}
                    />
                    {currentPlan === null ? (
                      <EmptyHint
                        icon={Workflow}
                        title="Plan appears after submit"
                        description="Once the planner compiles the circuit, each fragment becomes selectable here."
                      />
                    ) : null}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/50 bg-white/65 p-4 dark:border-white/8 dark:bg-black/15">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Selected fragment</p>
                      <p className="text-sm text-muted-foreground">
                        Primary route, fallbacks, and runtime outcome.
                      </p>
                    </div>
                    {selectedResult ? (
                      <StatusPill
                        status={currentJob?.status ?? "EXECUTING"}
                        label={selectedResult.status}
                      />
                    ) : null}
                  </div>

                  {selectedFragment && selectedAssignment ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <ServiceChip serviceType={selectedFragment.service_type} />
                        <Badge variant="outline" className="rounded-full">
                          q{selectedFragment.qubits.join(", ")}
                        </Badge>
                        <Badge variant="outline" className="rounded-full">
                          {selectedFragment.operation_ids.length} operation
                          {selectedFragment.operation_ids.length === 1 ? "" : "s"}
                        </Badge>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <MiniDataCard
                          label="Primary node"
                          value={shortId(selectedAssignment.primary_node_id, 12, 5)}
                          detail={selectedAssignment.primary_node_id}
                        />
                        <MiniDataCard
                          label="Fallbacks"
                          value={`${selectedAssignment.fallback_node_ids.length}`}
                          detail={
                            selectedAssignment.fallback_node_ids
                              .map((nodeId) => shortId(nodeId, 9, 4))
                              .join(" / ") || "No fallbacks"
                          }
                        />
                      </div>

                      {selectedResult ? (
                        <div className="grid gap-3 sm:grid-cols-3">
                          <MiniDataCard
                            label="Attempts"
                            value={`${selectedResult.attempts}`}
                            detail="Runtime retries used"
                          />
                          <MiniDataCard
                            label="Observed fidelity"
                            value={formatPercent(selectedResult.observed_fidelity)}
                            detail="Measured during execution"
                          />
                          <MiniDataCard
                            label="Duration"
                            value={formatDurationMs(
                              selectedResult.started_at,
                              selectedResult.finished_at
                            )}
                            detail="From invocation to completion"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <EmptyHint
                      icon={GitBranch}
                      title="Select a fragment"
                      description="Choose a fragment from the planner coverage list to inspect assignment details."
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section id="fabric" className="grid gap-6 xl:grid-cols-[1fr_1fr] xl:min-w-0">
          <Card className="glass-panel border-white/60 bg-white/76 dark:border-white/10 dark:bg-[#09121f]/78">
            <CardHeader>
              <SectionTitle
                icon={Network}
                eyebrow="Fabric"
                title="Service Topology"
                description="Every live node is shown with enough space for long peer IDs, ports, and capability coverage."
              />
            </CardHeader>
            <CardContent className="grid gap-4 overflow-x-auto min-w-0">
              {isOverviewLoading && networkNodes.length === 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={`fabric-skeleton-${index}`}
                      className="h-48 rounded-3xl border border-white/50 bg-white/60 animate-pulse dark:border-white/8 dark:bg-white/5"
                    />
                  ))}
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2 min-w-[320px]">
                {visibleNetworkNodes.map((node, index) => (
                  <button
                    key={node.nodeId}
                    type="button"
                    onClick={() => setSelectedNodeId(node.nodeId)}
                    className={cn(
                      "animate-fade-up rounded-[1.75rem] border p-5 text-left transition-transform duration-300 hover:-translate-y-0.5",
                      selectedNode?.nodeId === node.nodeId
                        ? "border-primary/30 bg-primary/6 shadow-[0_28px_80px_-44px_rgba(15,118,110,0.42)]"
                        : "border-white/60 bg-white/62 hover:border-primary/20 hover:bg-white/82 dark:border-white/8 dark:bg-white/4 dark:hover:bg-white/8"
                    )}
                    style={{ animationDelay: `${index * 90}ms` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                          Node {(fabricNodePage - 1) * FABRIC_NODE_PAGE_SIZE + index + 1}
                        </p>
                        <h3 className="font-mono text-sm font-medium break-all">
                          {node.nodeId}
                        </h3>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full",
                          node.availability
                            ? STATUS_STYLES.COMPLETED
                            : STATUS_STYLES.FAILED
                        )}
                      >
                        {node.availability ? "Available" : "Unavailable"}
                      </Badge>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <MiniDataCard
                        label="Port"
                        value={node.port ?? "--"}
                        detail="libp2p listener"
                      />
                      <MiniDataCard
                        label="Average fidelity"
                        value={formatPercent(node.averageFidelity)}
                        detail={`${node.serviceCount} advertised capabilities`}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {node.serviceTypes.map((serviceType) => (
                        <ServiceChip key={`${node.nodeId}-${serviceType}`} serviceType={serviceType} />
                      ))}
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/50 bg-white/60 p-3 dark:border-white/8 dark:bg-black/15">
                      <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                        Multiaddress
                      </div>
                      <div className="mt-2 font-mono text-[11px] break-all text-foreground/75">
                        {node.listenAddrs[0]}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <SectionPagination
                page={fabricNodePage}
                pageCount={fabricNodePageCount}
                pageSize={FABRIC_NODE_PAGE_SIZE}
                totalItems={networkNodes.length}
                itemLabel="nodes"
                onPageChange={setFabricNodePage}
              />
            </CardContent>
          </Card>

          <Card className="glass-panel border-white/60 bg-white/76 dark:border-white/10 dark:bg-[#09121f]/78">
            <CardHeader>
              <SectionTitle
                icon={Gauge}
                eyebrow="Quality"
                title="Node Fidelity Map"
                description="Select a node to compare per-service fidelity and capacity at a glance."
              />
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {selectedNode ? (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    <MiniDataCard
                      label="Node"
                      value={selectedNode.shortId}
                      detail={selectedNode.nodeId}
                    />
                    <MiniDataCard
                      label="Fidelity spread"
                      value={`${formatPercent(selectedNode.metrics?.min_fidelity)} - ${formatPercent(
                        selectedNode.metrics?.max_fidelity
                      )}`}
                      detail={`${selectedNode.metrics?.sample_count ?? 0} recorded services`}
                    />
                    <MiniDataCard
                      label="Qubit span"
                      value={`${selectedNode.minQubits} - ${selectedNode.maxQubits}`}
                      detail="Advertised execution range"
                    />
                  </div>

                  <div className="rounded-3xl border border-white/50 bg-white/65 p-4 dark:border-white/8 dark:bg-black/15">
                    <ChartContainer className="h-[18rem] w-full" config={nodeChartConfig}>
                      <BarChart
                        data={(selectedNode.metrics?.samples ?? []).map((sample) => ({
                          service: formatServiceLabel(sample.service_type),
                          fidelity: Number((sample.fidelity * 100).toFixed(2)),
                        }))}
                        margin={{ left: 8, right: 8, top: 8 }}
                      >
                        <CartesianGrid vertical={false} strokeDasharray="3 6" />
                        <XAxis
                          dataKey="service"
                          angle={-22}
                          height={64}
                          textAnchor="end"
                          tickMargin={10}
                        />
                        <YAxis
                          tickFormatter={(value) => `${value}%`}
                          domain={[90, 100]}
                        />
                        <ChartTooltip
                          cursor={false}
                          content={<ChartTooltipContent indicator="line" />}
                        />
                        <Bar
                          dataKey="fidelity"
                          fill="var(--color-fidelity)"
                          radius={[10, 10, 2, 2]}
                        />
                      </BarChart>
                    </ChartContainer>
                  </div>
                </>
              ) : (
                <EmptyHint
                  icon={Server}
                  title="No nodes discovered"
                  description="The fabric chart will appear as soon as the coordinator reports active service advertisements."
                />
              )}
            </CardContent>
          </Card>
        </section>

        <section id="execution" className="flex flex-col gap-6">
          <Card className="glass-panel border-white/60 bg-white/78 dark:border-white/10 dark:bg-[#09121f]/78">
            <CardHeader>
              <SectionTitle
                icon={Workflow}
                eyebrow="Execution"
                title="Fragment Graph"
                description="The compiled plan is laid out as a readable DAG so routing dependencies are visible instead of hidden in JSON."
              />
            </CardHeader>
            <CardContent>
              <DagBoard
                dagModel={dagModel}
                selectedFragmentId={selectedFragment?.fragment_id ?? null}
                onSelectFragment={setSelectedFragmentId}
              />
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <Card className="glass-panel border-white/60 bg-white/78 dark:border-white/10 dark:bg-[#09121f]/78">
              <CardHeader>
                <SectionTitle
                  icon={Activity}
                  eyebrow="Runtime"
                  title="Fragment Timeline"
                  description="Execution results are stacked in order, with per-fragment duration and observed fidelity."
                />
              </CardHeader>
              <CardContent className="grid gap-3">
                {visibleFragmentIds.map((fragmentId) => {
                  const fragment = currentPlan?.fragments[fragmentId]
                  const result = currentJob?.result?.fragment_results.find(
                    (entry) => entry.fragment_id === fragmentId
                  )

                  if (!fragment) {
                    return null
                  }

                  return (
                    <button
                      key={fragmentId}
                      type="button"
                      onClick={() => setSelectedFragmentId(fragmentId)}
                      className={cn(
                        "rounded-3xl border p-4 text-left transition-all",
                        selectedFragment?.fragment_id === fragmentId
                          ? "border-primary/30 bg-primary/6"
                          : "border-white/60 bg-white/65 hover:border-primary/20 hover:bg-white/82 dark:border-white/8 dark:bg-white/4 dark:hover:bg-white/8"
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                            {fragment.fragment_id}
                          </p>
                          <p className="text-sm font-medium">
                            {formatServiceLabel(fragment.service_type)}
                          </p>
                        </div>
                        <StatusPill
                          status={currentJob?.status ?? "QUEUED"}
                          label={result?.status ?? "Pending"}
                          className={
                            result?.status === "SUCCESS"
                              ? STATUS_STYLES.COMPLETED
                              : undefined
                          }
                        />
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <MiniDataCard
                          label="Route"
                          value={result?.node_id ? shortId(result.node_id, 9, 4) : "--"}
                          detail={result?.node_id ?? "Waiting for assignment"}
                        />
                        <MiniDataCard
                          label="Duration"
                          value={formatDurationMs(result?.started_at, result?.finished_at)}
                          detail="Runtime window"
                        />
                        <MiniDataCard
                          label="Observed fidelity"
                          value={formatPercent(result?.observed_fidelity)}
                          detail={result ? `Attempts ${result.attempts}` : "Pending execution"}
                        />
                      </div>
                    </button>
                  )
                })}
                <SectionPagination
                  page={fragmentListPage}
                  pageCount={fragmentListPageCount}
                  pageSize={FRAGMENT_PAGE_SIZE}
                  totalItems={fragmentIds.length}
                  itemLabel="fragments"
                  onPageChange={setFragmentListPage}
                />

                {currentPlan === null ? (
                  <EmptyHint
                    icon={Clock3}
                    title="Timeline waits for a job"
                    description="Submit a circuit and the runtime fragments will appear here as they are scheduled and completed."
                  />
                ) : null}
              </CardContent>
            </Card>

            <Card className="glass-panel border-white/60 bg-white/78 dark:border-white/10 dark:bg-[#09121f]/78">
              <CardHeader>
                <SectionTitle
                  icon={GitBranch}
                  eyebrow="Routing"
                  title="Candidate Scoreboard"
                  description="Compare the planner's chosen route against fallback candidates for the selected fragment."
                />
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                {selectedAssignment ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <MiniDataCard
                        label="Primary route"
                        value={shortId(selectedAssignment.primary_node_id, 12, 5)}
                        detail={selectedAssignment.primary_node_id}
                      />
                      <MiniDataCard
                        label="Fallback nodes"
                        value={`${selectedAssignment.fallback_node_ids.length}`}
                        detail={
                          selectedAssignment.fallback_node_ids
                            .map((nodeId) => shortId(nodeId, 8, 4))
                            .join(" / ") || "No fallbacks"
                        }
                      />
                    </div>

                    <div className="rounded-3xl border border-white/50 bg-white/65 p-4 dark:border-white/8 dark:bg-black/15">
                      <ChartContainer className="h-[17rem] w-full" config={costChartConfig}>
                        <BarChart data={candidateData} margin={{ left: 8, right: 12, top: 8 }}>
                          <CartesianGrid vertical={false} strokeDasharray="3 6" />
                          <XAxis dataKey="node" />
                          <YAxis />
                          <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent indicator="line" />}
                          />
                          <Bar dataKey="totalCost" radius={[10, 10, 2, 2]}>
                            {candidateData.map((candidate) => (
                              <Cell
                                key={candidate.fullNodeId}
                                fill={candidate.isPrimary ? "#0f766e" : "#94a3b8"}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    </div>

                    <div className="grid gap-3">
                      {(selectedAssignment.candidates ?? []).map((candidate: PlanCandidate) => (
                        <CandidateRow
                          key={candidate.node_id}
                          candidate={candidate}
                          isPrimary={candidate.node_id === selectedAssignment.primary_node_id}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyHint
                    icon={ArrowRight}
                    title="Choose a fragment from the graph"
                    description="Once a fragment is selected, the candidate ranking and cost breakdown land here."
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="analysis" className="flex flex-col gap-6">
          <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
            <Card className="glass-panel border-white/60 bg-white/78 dark:border-white/10 dark:bg-[#09121f]/78">
              <CardHeader>
                <SectionTitle
                  icon={Gauge}
                  eyebrow="Analysis"
                  title="Measurement Landscape"
                  description="Counts and basis probabilities are separated into their own surfaces so the quantum output stays readable."
                />
              </CardHeader>
              <CardContent className="grid gap-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <ChartCard
                    title="Counts"
                    subtitle="Shot distribution"
                    data={countsData}
                    emptyMessage="Counts appear when the circuit includes a measurement."
                    config={measurementChartConfig}
                    dataKey="value"
                    labelKey="state"
                    fill="#c2410c"
                    valueFormatter={(value) => `${value}`}
                  />
                  <ChartCard
                    title="Measured probabilities"
                    subtitle="Normalized outcome weights"
                    data={measuredProbabilityData.map((entry) => ({
                      ...entry,
                      value: Number((entry.value * 100).toFixed(2)),
                    }))}
                    emptyMessage="Measured probabilities will appear after execution."
                    config={measurementChartConfig}
                    dataKey="value"
                    labelKey="state"
                    fill="#0f766e"
                    valueFormatter={(value) => `${value}%`}
                  />
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <ChartCard
                    title="Top basis states"
                    subtitle="Dominant amplitudes"
                    data={topBasisData.map((entry) => ({
                      ...entry,
                      value: Number((entry.value * 100).toFixed(2)),
                    }))}
                    emptyMessage="Top basis states appear when the quantum result is available."
                    config={measurementChartConfig}
                    dataKey="value"
                    labelKey="state"
                    fill="#1d4ed8"
                    valueFormatter={(value) => `${value}%`}
                  />
                  <div className="rounded-3xl border border-white/50 bg-white/65 p-4 dark:border-white/8 dark:bg-black/15">
                    <div className="mb-4">
                      <p className="text-sm font-medium">Fidelity envelope</p>
                      <p className="text-sm text-muted-foreground">
                        Target vs estimated execution quality.
                      </p>
                    </div>
                    <div className="space-y-5">
                      <ProgressStat
                        label="Target fidelity"
                        value={quantumResult?.fidelity?.fidelity_to_target_state ?? null}
                      />
                      <ProgressStat
                        label="Estimated execution fidelity"
                        value={quantumResult?.fidelity?.estimated_execution_fidelity ?? null}
                      />
                      <div className="rounded-2xl border border-white/50 bg-white/70 p-4 text-sm dark:border-white/8 dark:bg-white/6">
                        <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                          Target state
                        </div>
                        <div className="mt-2 font-medium">
                          {quantumResult?.fidelity?.target_state ?? "--"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-white/60 bg-white/78 dark:border-white/10 dark:bg-[#09121f]/78">
              <CardHeader>
                <SectionTitle
                  icon={Sparkles}
                  eyebrow="State"
                  title="Observables and Qubit Geometry"
                  description="Expectation values, Bloch vectors, and entanglement are broken apart for cleaner interpretation."
                />
              </CardHeader>
              <CardContent className="grid gap-6">
                <div className="rounded-3xl border border-white/50 bg-white/65 p-4 dark:border-white/8 dark:bg-black/15">
                  <div className="mb-4">
                    <p className="text-sm font-medium">Observable expectations</p>
                    <p className="text-sm text-muted-foreground">
                      Signed values after the distributed circuit is reconstructed.
                    </p>
                  </div>
                  <ChartContainer className="h-[17rem] w-full" config={observableChartConfig}>
                    <BarChart
                      data={observableData}
                      margin={{ left: 8, right: 12, top: 8 }}
                      layout="vertical"
                    >
                      <CartesianGrid horizontal={false} strokeDasharray="3 6" />
                      <XAxis type="number" domain={[-1, 1]} />
                      <YAxis
                        type="category"
                        dataKey="observable"
                        width={84}
                        tickLine={false}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent indicator="line" />}
                      />
                      <Bar dataKey="value" radius={[10, 10, 10, 10]}>
                        {observableData.map((entry) => (
                          <Cell
                            key={entry.observable}
                            fill={entry.value >= 0 ? "#15803d" : "#be123c"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                  {observableData.length === 0 ? (
                    <div className="pt-3">
                      <EmptyHint
                        icon={Gauge}
                        title="Waiting for observable data"
                        description="Observable expectations will show up after the quantum result lands."
                      />
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-3xl border border-white/50 bg-white/65 p-4 dark:border-white/8 dark:bg-black/15">
                    <div className="mb-4">
                      <p className="text-sm font-medium">Bloch vectors</p>
                      <p className="text-sm text-muted-foreground">
                        Each qubit axis component rendered independently. The Bloch sphere shows the qubit state on the unit sphere (X, Y, Z axes).
                      </p>
                    </div>
                    <div className="flex flex-wrap items-start gap-6">
                      {visibleBlochData.map((qubit) => (
                        <div key={qubit.qubit} className="flex flex-col items-center gap-3">
                          <BlochSphere
                            vector={[qubit.x, qubit.y, qubit.z]}
                            label={qubit.qubit}
                            size={200}
                          />
                          <div className="w-full space-y-2 rounded-2xl border border-white/50 bg-white/70 p-3 dark:border-white/8 dark:bg-white/5">
                            <AxisMeter label="X" value={qubit.x} color="#1d4ed8" />
                            <AxisMeter label="Y" value={qubit.y} color="#c2410c" />
                            <AxisMeter label="Z" value={qubit.z} color="#15803d" />
                          </div>
                        </div>
                      ))}
                      {blochData.length === 0 ? (
                        <div className="w-full">
                          <EmptyHint
                            icon={Orbit}
                            title="Bloch vectors will appear here"
                            description="Run a circuit to render x, y, and z components for each measured qubit."
                          />
                        </div>
                      ) : null}
                    </div>
                    <SectionPagination
                      page={blochPage}
                      pageCount={blochPageCount}
                      pageSize={BLOCH_PAGE_SIZE}
                      totalItems={blochData.length}
                      itemLabel="qubits"
                      onPageChange={setBlochPage}
                    />
                  </div>

                  <div className="rounded-3xl border border-white/50 bg-white/65 p-4 dark:border-white/8 dark:bg-black/15">
                    <div className="mb-4">
                      <p className="text-sm font-medium">Entanglement entropy</p>
                      <p className="text-sm text-muted-foreground">
                        Bipartition summary for each qubit against the rest of the system.
                      </p>
                    </div>
                    <div className="space-y-4">
                      {visibleEntropyData.map(({ label, value }) => (
                        <div key={label} className="space-y-2">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="font-medium">{label}</span>
                            <span className="font-mono">
                              {value.toFixed(4)}
                            </span>
                          </div>
                          <Progress
                            value={Math.max(0, Math.min(100, value * 100))}
                            className="h-2"
                          />
                        </div>
                      ))}
                      {allEntropyZero ? (
                        <p className="text-xs text-muted-foreground">
                          State is separable (no entanglement). Run a circuit with only a Bell-pair step to see entropy 1.
                        </p>
                      ) : null}
                      {entropyData.length === 0 ? (
                        <EmptyHint
                          icon={Sparkles}
                          title="No entanglement metrics yet"
                          description="Entropy metrics populate after the backend reconstructs the result state."
                        />
                      ) : null}
                    </div>
                    <SectionPagination
                      page={entropyPage}
                      pageCount={entropyPageCount}
                      pageSize={ENTROPY_PAGE_SIZE}
                      totalItems={entropyData.length}
                      itemLabel="entropy rows"
                      onPageChange={setEntropyPage}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="glass-panel border-white/60 bg-white/78 dark:border-white/10 dark:bg-[#09121f]/78">
            <CardHeader>
              <SectionTitle
                icon={Binary}
                eyebrow="Deep view"
                title="Statevector and Density Matrices"
                description="Detailed quantum output stays accessible, but tucked into roomy tabs so it does not overwhelm the main flow."
              />
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="statevector" className="gap-4">
                <TabsList variant="line" className="w-full justify-start gap-2 overflow-x-auto rounded-full">
                  <TabsTrigger value="statevector">Statevector</TabsTrigger>
                  <TabsTrigger value="density">Density matrices</TabsTrigger>
                  <TabsTrigger value="metadata">Job metadata</TabsTrigger>
                </TabsList>

                <TabsContent value="statevector">
                  <div className="mb-4 rounded-2xl border border-white/50 bg-white/60 p-4 dark:border-white/8 dark:bg-white/5">
                    <p className="text-sm font-medium">What is the statevector?</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      The statevector describes the quantum state after your circuit runs. Each row shows a basis state (e.g. |00&gt;, |01&gt;) and its amplitude—a complex number (a+bi). The squared magnitude |a+bi|² gives the probability of measuring that state. Values like 0.707+0j mean ≈50% probability; 1+0j means 100%.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {statevectorRows.map((row) => (
                      <div
                        key={row.basisState}
                        className="rounded-3xl border border-white/50 bg-white/65 p-4 dark:border-white/8 dark:bg-white/5"
                      >
                        <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                          |{row.basisState}&gt;
                        </div>
                        <div className="mt-3 font-mono text-sm break-all">
                          {row.amplitude}
                        </div>
                      </div>
                    ))}
                    {statevectorRows.length === 0 ? (
                      <EmptyHint
                        icon={Binary}
                        title="No statevector yet"
                        description="Execute a circuit to inspect the reconstructed amplitudes here."
                      />
                    ) : null}
                  </div>
                  <SectionPagination
                    page={statevectorPage}
                    pageCount={statevectorPageCount}
                    pageSize={STATEVECTOR_PAGE_SIZE}
                    totalItems={statevectorValues.length}
                    itemLabel="statevector amplitudes"
                    onPageChange={setStatevectorPage}
                  />
                </TabsContent>

                <TabsContent value="density">
                  <div className="mb-4 rounded-2xl border border-white/50 bg-white/60 p-4 dark:border-white/8 dark:bg-white/5">
                    <p className="text-sm font-medium">What are density matrices?</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Density matrices represent mixed or reduced quantum states. When you trace out (ignore) some qubits, the remaining subsystem is described by a reduced density matrix. Each matrix element is a complex number; the diagonal gives measurement probabilities. Used for analyzing entanglement and decoherence.
                    </p>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {visibleDensityMatrixEntries.map(([label, matrix]) => (
                        <div
                          key={label}
                          className="rounded-3xl border border-white/50 bg-white/65 p-4 dark:border-white/8 dark:bg-white/5"
                        >
                          <div className="mb-4">
                            <p className="text-sm font-medium">{label}</p>
                            <p className="text-sm text-muted-foreground">
                              Reduced density matrix
                            </p>
                          </div>
                          <div className="grid gap-2">
                            {matrix.map((row, rowIndex) => (
                              <div
                                key={`${label}-${rowIndex}`}
                                className="grid grid-cols-2 gap-2"
                              >
                                {row.map((value, columnIndex) => (
                                  <div
                                    key={`${label}-${rowIndex}-${columnIndex}`}
                                    className="rounded-2xl border border-white/50 bg-white/70 px-3 py-2 font-mono text-xs break-all dark:border-white/8 dark:bg-black/15"
                                  >
                                    {value}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                    {densityMatrixEntries.length === 0 ? (
                      <EmptyHint
                        icon={Cpu}
                        title="Density matrices unavailable"
                        description="The matrix view appears after the backend finishes post-processing the circuit."
                      />
                    ) : null}
                  </div>
                  <SectionPagination
                    page={densityMatrixPage}
                    pageCount={densityMatrixPageCount}
                    pageSize={DENSITY_MATRIX_PAGE_SIZE}
                    totalItems={densityMatrixEntries.length}
                    itemLabel="density matrices"
                    onPageChange={setDensityMatrixPage}
                  />
                </TabsContent>

                <TabsContent value="metadata">
                  <div className="mb-4 rounded-2xl border border-white/50 bg-white/60 p-4 dark:border-white/8 dark:bg-white/5">
                    <p className="text-sm font-medium">Job metadata</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Timestamps, measured qubit indices, and plan quality snapshot for the current run.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MiniDataCard
                      label="Created"
                      value={formatTimestamp(currentJob?.created_at)}
                      detail={currentJob?.created_at ?? "--"}
                    />
                    <MiniDataCard
                      label="Updated"
                      value={formatTimestamp(currentJob?.updated_at)}
                      detail={currentJob?.updated_at ?? "--"}
                    />
                    <MiniDataCard
                      label="Measured qubits"
                      value={
                        quantumResult?.measured_qubits?.length
                          ? quantumResult.measured_qubits.join(", ")
                          : "--"
                      }
                      detail="Measured qubit indices"
                    />
                    <MiniDataCard
                      label="Plan quality snapshot"
                      value={currentPlan?.quality_snapshot_id ? "Recorded" : "--"}
                      detail={currentPlan?.quality_snapshot_id ?? "No plan yet"}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}

function SectionPagination({
  page,
  pageCount,
  pageSize,
  totalItems,
  itemLabel,
  onPageChange,
}: {
  page: number
  pageCount: number
  pageSize: number
  totalItems: number
  itemLabel: string
  onPageChange: (page: number) => void
}) {
  if (totalItems <= pageSize) {
    return null
  }

  const startItem = (page - 1) * pageSize + 1
  const endItem = Math.min(totalItems, page * pageSize)
  const paginationItems = buildPaginationItems(page, pageCount)

  const handlePageChange = (
    event: MouseEvent<HTMLAnchorElement>,
    nextPage: number
  ) => {
    event.preventDefault()
    onPageChange(nextPage)
  }

  return (
    <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Showing {startItem}-{endItem} of {totalItems} {itemLabel}
      </div>
      <Pagination className="mx-0 w-auto justify-start sm:justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(event) => handlePageChange(event, Math.max(1, page - 1))}
              className={cn(page === 1 && "pointer-events-none opacity-50")}
            />
          </PaginationItem>
          {paginationItems.map((item, index) => (
            <PaginationItem key={`${item}-${index}`}>
              {item === "ellipsis" ? (
                <PaginationEllipsis />
              ) : (
                <PaginationLink
                  href="#"
                  isActive={item === page}
                  onClick={(event) => handlePageChange(event, item)}
                >
                  {item}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(event) => handlePageChange(event, Math.min(pageCount, page + 1))}
              className={cn(page === pageCount && "pointer-events-none opacity-50")}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}

function ThemeSwitch({
  theme,
  setTheme,
}: {
  theme: string
  setTheme: (theme: "dark" | "light" | "system") => void
}) {
  const options: Array<{
    value: "light" | "dark" | "system"
    label: string
    icon: ComponentType<{ className?: string }>
  }> = [
      { value: "light", label: "Light", icon: SunMedium },
      { value: "dark", label: "Dark", icon: MoonStar },
      { value: "system", label: "System", icon: Monitor },
    ]

  return (
    <div className="flex items-center gap-1 rounded-full border border-white/50 bg-white/75 p-1 shadow-[0_18px_40px_-26px_rgba(15,118,110,0.35)] dark:border-white/10 dark:bg-white/6">
      {options.map((option) => {
        const Icon = option.icon

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors",
              theme === option.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-foreground/70 hover:bg-white/70 dark:hover:bg-white/10"
            )}
          >
            <Icon className="size-3.5" />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function SectionTitle({
  icon: Icon,
  eyebrow,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        <Icon className="size-4" />
        {eyebrow}
      </div>
      <div className="space-y-1">
        <CardTitle className="text-2xl tracking-tight">{title}</CardTitle>
        <CardDescription className="max-w-2xl text-sm leading-6">
          {description}
        </CardDescription>
      </div>
    </div>
  )
}

function MetricTile({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
  hint: string
  accent: "teal" | "amber" | "blue"
}) {
  const accentClass =
    accent === "teal"
      ? "from-teal-500/14 to-teal-500/4 shadow-[0_24px_64px_-40px_rgba(20,184,166,0.45)]"
      : accent === "amber"
        ? "from-amber-500/14 to-amber-500/4 shadow-[0_24px_64px_-40px_rgba(245,158,11,0.42)]"
        : "from-sky-500/14 to-sky-500/4 shadow-[0_24px_64px_-40px_rgba(59,130,246,0.42)]"

  return (
    <div
      className={cn(
        "rounded-[1.6rem] border border-white/50 bg-linear-to-br p-4 shadow-[0_24px_64px_-40px] dark:border-white/8",
        accentClass
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">{label}</div>
        <Icon className="size-4 text-primary" />
      </div>
      <div className="mt-4 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-sm text-foreground/68">{hint}</div>
    </div>
  )
}

function HeroMiniStat({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      <div className="font-medium break-all">{value}</div>
      <div className="text-sm leading-6 text-foreground/62">{detail}</div>
    </div>
  )
}

type RegistryPeerNodeData = {
  shortId: string
  port: string | null
  fidelityLabel: string
  serviceCount: number
  serviceTypes: string[]
  primaryServiceType: string
  availability: boolean
  isFocused: boolean
  connectionCount: number
}

type RegistryPeerFlowNode = Node<RegistryPeerNodeData, "peer">

function RegistryPeerNodeComponent({
  data,
  selected,
}: NodeProps<RegistryPeerFlowNode>) {
  const style =
    SERVICE_STYLES[data.primaryServiceType] ?? SERVICE_STYLES.bell_pair

  return (
    <div
      className={cn(
        "min-w-[14rem] rounded-[1.8rem] border p-4 shadow-[0_28px_70px_-42px_rgba(15,23,42,0.38)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1.5",
        selected || data.isFocused
          ? "border-primary/40 bg-white/92 dark:border-primary/30 dark:bg-[#12243c]/96"
          : "border-white/60 bg-white/80 dark:border-white/10 dark:bg-[#0d192c]/86"
      )}
      style={{
        boxShadow:
          selected || data.isFocused
            ? `0 30px 70px -42px ${style.glow}`
            : undefined,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-0 !bg-white/0"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-transparent"
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex size-3 rounded-full"
            style={{
              backgroundColor: style.stroke,
              boxShadow: `0 0 0 6px ${style.fill}`,
            }}
          />
          <span className="rounded-full border border-white/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-foreground/70 dark:border-white/10">
            Mesh live
          </span>
        </div>
        <span className="rounded-full border border-white/50 px-2 py-0.5 text-[10px] font-medium text-foreground/70 dark:border-white/10">
          {data.port ? `tcp/${data.port}` : "embedded"}
        </span>
      </div>
      <div className="mt-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Quantum peer
        </div>
        <div className="mt-1 text-sm font-semibold">{data.shortId}</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-white/45 bg-white/55 px-3 py-2 text-xs dark:border-white/8 dark:bg-white/6">
          <div className="uppercase tracking-[0.2em] text-muted-foreground">Fidelity</div>
          <div className="mt-1 font-semibold">{data.fidelityLabel}</div>
        </div>
        <div className="rounded-2xl border border-white/45 bg-white/55 px-3 py-2 text-xs dark:border-white/8 dark:bg-white/6">
          <div className="uppercase tracking-[0.2em] text-muted-foreground">Coverage</div>
          <div className="mt-1 font-semibold">{data.serviceCount} services</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {data.serviceTypes.slice(0, 3).map((serviceType) => (
          <span
            key={`${data.shortId}-${serviceType}`}
            className="rounded-full border border-white/50 px-2 py-1 text-[10px] font-medium text-foreground/72 dark:border-white/10"
          >
            {formatServiceLabel(serviceType)}
          </span>
        ))}
      </div>
      <div className="mt-3 rounded-[1.2rem] border border-white/45 bg-white/55 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground dark:border-white/8 dark:bg-white/6">
        <div className="flex items-center justify-between gap-3">
          <span>{data.connectionCount} mesh links</span>
          <span>{data.availability ? "Live" : "Unavailable"}</span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <span>Select for detail</span>
        <span>Drag to compare</span>
      </div>
    </div>
  )
}

const registryNodeTypes = {
  peer: RegistryPeerNodeComponent,
}

function buildRegistryFlowNodes({
  serviceGroups,
  selectedNodeId,
}: {
  serviceGroups: NodeServiceGroup[]
  selectedNodeId: string | null
}) {
  if (!serviceGroups.length) {
    return []
  }

  const peerCount = serviceGroups.length
  const peerWidth = 224
  const peerHeight = 224
  const centerX = 360
  const centerY = 238
  const radiusX =
    peerCount <= 1 ? 0 : Math.max(140, Math.min(250, 110 + peerCount * 34))
  const radiusY =
    peerCount <= 1 ? 0 : Math.max(105, Math.min(190, 82 + peerCount * 22))

  const peerNodes: RegistryPeerFlowNode[] = serviceGroups.map((group, index) => {
    const angle =
      peerCount === 1 ? 0 : -Math.PI / 2 + (Math.PI * 2 * index) / peerCount
    const x = Math.round(centerX + Math.cos(angle) * radiusX - peerWidth / 2)
    const y = Math.round(centerY + Math.sin(angle) * radiusY - peerHeight / 2)

    return {
      id: group.node.nodeId,
      type: "peer",
      position: { x, y },
      draggable: true,
      data: {
        shortId: group.node.shortId,
        port: group.node.port,
        fidelityLabel: formatPercent(group.node.averageFidelity),
        serviceCount: group.advertisements.length,
        serviceTypes: group.node.serviceTypes,
        primaryServiceType: group.node.serviceTypes[0] ?? "bell_pair",
        availability: group.node.availability,
        isFocused: selectedNodeId === group.node.nodeId,
        connectionCount: Math.max(peerCount - 1, 0),
      },
    }
  })

  return peerNodes
}

function buildRegistryFlowEdges({
  serviceGroups,
  selectedNodeId,
}: {
  serviceGroups: NodeServiceGroup[]
  selectedNodeId: string | null
}) {
  const edges: Edge[] = []

  for (let sourceIndex = 0; sourceIndex < serviceGroups.length; sourceIndex += 1) {
    for (
      let targetIndex = sourceIndex + 1;
      targetIndex < serviceGroups.length;
      targetIndex += 1
    ) {
      const sourceGroup = serviceGroups[sourceIndex]
      const targetGroup = serviceGroups[targetIndex]
      const sourceStyle =
        SERVICE_STYLES[sourceGroup.node.serviceTypes[0] ?? "bell_pair"] ??
        SERVICE_STYLES.bell_pair
      const isFocused =
        selectedNodeId !== null &&
        (selectedNodeId === sourceGroup.node.nodeId ||
          selectedNodeId === targetGroup.node.nodeId)

      edges.push({
        id: `edge-${sourceGroup.node.nodeId}-${targetGroup.node.nodeId}`,
        source: sourceGroup.node.nodeId,
        target: targetGroup.node.nodeId,
        type: "bezier",
        animated: isFocused,
        style: {
          stroke: isFocused ? sourceStyle.stroke : "rgba(71, 85, 105, 0.34)",
          strokeWidth: isFocused ? 2.8 : 1.8,
          strokeDasharray: isFocused ? undefined : "8 10",
        },
      })
    }
  }

  return edges
}

function ServiceBroadcastBoard({
  serviceGroups,
  selectedNodeId,
  onSelectNode,
  latestServiceUpdateAt,
}: {
  serviceGroups: NodeServiceGroup[]
  selectedNodeId: string | null
  onSelectNode: (nodeId: string) => void
  latestServiceUpdateAt: string | null
}) {
  const selectedGroup =
    serviceGroups.find((group) => group.node.nodeId === selectedNodeId) ??
    serviceGroups[0] ??
    null
  const totalRecords = serviceGroups.reduce(
    (total, group) => total + group.advertisements.length,
    0
  )
  const totalAvailable = serviceGroups.reduce(
    (total, group) =>
      total +
      group.advertisements.filter((advertisement) => advertisement.availability).length,
    0
  )
  const meshLinkCount = Math.max(
    (serviceGroups.length * Math.max(serviceGroups.length - 1, 0)) / 2,
    0
  )
  const baseFlowNodes = useMemo(
    () =>
      buildRegistryFlowNodes({
        serviceGroups,
        selectedNodeId,
      }),
    [selectedNodeId, serviceGroups]
  )
  const [flowNodes, setFlowNodes, onNodesChange] =
    useNodesState<RegistryPeerFlowNode>(baseFlowNodes)

  useEffect(() => {
    setFlowNodes((currentNodes) => {
      const currentById = new Map(currentNodes.map((node) => [node.id, node]))

      return baseFlowNodes.map((node) => {
        const currentNode = currentById.get(node.id)
        if (!currentNode) {
          return node
        }

        return {
          ...node,
          position: currentNode.position,
        }
      })
    })
  }, [baseFlowNodes, setFlowNodes])

  const flowEdges = useMemo<Edge[]>(
    () =>
      buildRegistryFlowEdges({
        serviceGroups,
        selectedNodeId: selectedGroup?.node.nodeId ?? null,
      }),
    [selectedGroup?.node.nodeId, serviceGroups]
  )

  return (
    <div className="grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
      <div className="overflow-hidden rounded-[2.15rem] border border-white/55 bg-[linear-gradient(180deg,rgba(255,255,255,0.74),rgba(255,255,255,0.44))] shadow-[0_34px_88px_-50px_rgba(15,23,42,0.36)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(10,18,31,0.92),rgba(9,17,28,0.74))]">
        <div className="flex items-center justify-between gap-3 border-b border-white/45 bg-white/45 px-4 py-3 dark:border-white/8 dark:bg-white/4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Distributed peer mesh
            </div>
            <div className="mt-1 text-sm text-foreground/68">
              Drag peers to reshape the fabric and inspect how the live system is woven together.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-full px-3 py-1">
              {meshLinkCount} peer links
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">
              Drag peers
            </Badge>
          </div>
        </div>
        <div className="relative h-[32rem] overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.16),rgba(56,189,248,0.1),transparent_70%)] blur-3xl" />
            <div className="absolute left-10 top-10 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.12),transparent_72%)] blur-2xl" />
            <div className="absolute bottom-10 right-10 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.12),transparent_74%)] blur-2xl" />
          </div>
          <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-wrap gap-2">
            <div className="rounded-full border border-white/55 bg-white/78 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/72 shadow-sm dark:border-white/10 dark:bg-[#0d1a2b]/88">
              Full mesh
            </div>
            <div className="rounded-full border border-white/55 bg-white/78 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/72 shadow-sm dark:border-white/10 dark:bg-[#0d1a2b]/88">
              {serviceGroups.length} peers synced
            </div>
          </div>
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={registryNodeTypes}
            onNodesChange={onNodesChange}
            nodesDraggable
            nodesConnectable={false}
            panOnDrag={false}
            selectionOnDrag={false}
            fitView
            fitViewOptions={{ padding: 0.22 }}
            minZoom={0.7}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_, node) => {
              if (node.type === "peer") {
                onSelectNode(node.id)
              }
            }}
            className="bg-transparent"
          >
            <Background gap={28} size={1} color="rgba(148,163,184,0.18)" />
            <Controls showInteractive={false} position="top-right" />
          </ReactFlow>
        </div>

        <div className="grid gap-3 border-t border-white/45 bg-white/45 p-4 md:grid-cols-3 dark:border-white/8 dark:bg-white/4">
          <MiniDataCard
            label="Peer links"
            value={`${meshLinkCount}`}
            detail="active relationships visible in the fabric"
          />
          <MiniDataCard
            label="Availability"
            value={`${totalAvailable}/${totalRecords}`}
            detail="advertisements currently reporting up"
          />
          <MiniDataCard
            label="Latest update"
            value={
              latestServiceUpdateAt ? formatTimestamp(latestServiceUpdateAt) : "--"
            }
            detail="most recent fabric heartbeat"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {serviceGroups.map((group) => (
            <button
              key={`selector-${group.node.nodeId}`}
              type="button"
              onClick={() => onSelectNode(group.node.nodeId)}
              className={cn(
                "rounded-full border px-3 py-2 text-xs font-medium transition-colors",
                selectedGroup?.node.nodeId === group.node.nodeId
                  ? "border-primary/30 bg-primary/8 text-primary"
                  : "border-white/55 bg-white/70 text-foreground/72 hover:border-primary/20 hover:bg-white/82 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8"
              )}
            >
              {group.node.shortId}
            </button>
          ))}
        </div>

        {selectedGroup ? (
          <div className="rounded-[2rem] border border-white/55 bg-white/72 p-5 shadow-[0_26px_70px_-44px_rgba(15,23,42,0.34)] dark:border-white/10 dark:bg-[#0d1828]/84">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Selected peer
                </div>
                <div className="mt-2 font-mono text-sm break-all">
                  {selectedGroup.node.nodeId}
                </div>
              </div>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {selectedGroup.advertisements.length} service ads
              </Badge>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <MiniDataCard
                label="Listen address"
                value={selectedGroup.node.port ? `tcp/${selectedGroup.node.port}` : "--"}
                detail={selectedGroup.node.listenAddrs[0] ?? "No listen address"}
              />
              <MiniDataCard
                label="Qubit span"
                value={`${selectedGroup.node.minQubits} - ${selectedGroup.node.maxQubits}`}
                detail="advertised execution range"
              />
              <MiniDataCard
                label="Latest heartbeat"
                value={
                  selectedGroup.latestUpdatedAt
                    ? formatTimestamp(selectedGroup.latestUpdatedAt)
                    : "--"
                }
                detail={selectedGroup.latestUpdatedAt ?? "No timestamp"}
              />
            </div>

            <div className="mt-5 space-y-3">
              {selectedGroup.advertisements.map((advertisement) => (
                <div
                  key={`${selectedGroup.node.nodeId}-${advertisement.service_type}`}
                  className="rounded-[1.35rem] border border-white/50 bg-white/70 p-3 dark:border-white/8 dark:bg-white/6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <ServiceChip serviceType={advertisement.service_type} />
                      <span className="text-xs text-foreground/62">
                        {advertisement.qubit_min}-{advertisement.qubit_max} qubits
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="rounded-full px-2.5 py-1 text-[11px]">
                        {formatPercent(advertisement.fidelity)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px]",
                          advertisement.availability
                            ? STATUS_STYLES.COMPLETED
                            : STATUS_STYLES.FAILED
                        )}
                      >
                        {advertisement.availability ? "up" : "down"}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyHint
            icon={Server}
            title="No service advertisements yet"
            description="Once the coordinator reports live advertisements, the raw endpoint groups will appear here."
          />
        )}
      </div>
    </div>
  )
}

function PulseStat({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
  detail: string
  tone: "success" | "info" | "warning"
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-400/10 dark:text-emerald-200"
      : tone === "info"
        ? "border-sky-300/60 bg-sky-500/10 text-sky-700 dark:border-sky-500/30 dark:bg-sky-400/10 dark:text-sky-200"
        : "border-amber-300/60 bg-amber-500/10 text-amber-700 dark:border-amber-500/30 dark:bg-amber-400/10 dark:text-amber-200"
  const iconClass =
    tone === "success"
      ? "border-emerald-300/50 bg-emerald-500/12 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-400/10 dark:text-emerald-200"
      : tone === "info"
        ? "border-sky-300/50 bg-sky-500/12 text-sky-700 dark:border-sky-500/20 dark:bg-sky-400/10 dark:text-sky-200"
        : "border-amber-300/50 bg-amber-500/12 text-amber-700 dark:border-amber-500/20 dark:bg-amber-400/10 dark:text-amber-200"

  return (
    <div className="rounded-[1.6rem] border border-white/55 bg-white/72 p-4 shadow-[0_22px_54px_-42px_rgba(15,23,42,0.28)] transition-transform duration-300 hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/6">
      <div className="flex items-start justify-between gap-3">
        <div className={cn("flex size-10 items-center justify-center rounded-2xl border", iconClass)}>
          <Icon className="size-4" />
        </div>
        <div className={cn("rounded-full border px-2.5 py-1 text-[11px]", toneClass)}>{label}</div>
      </div>
      <div className="mt-4 text-base font-semibold tracking-tight">{value}</div>
      <div className="mt-2 text-sm leading-6 text-foreground/72">{detail}</div>
    </div>
  )
}

function LifecycleRail({ currentStatus }: { currentStatus: JobStatus | undefined }) {
  const currentIndex = currentStatus ? JOB_PHASES.indexOf(currentStatus) : -1

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
      {JOB_PHASES.map((phase, index) => {
        const isReached = currentIndex >= index || phase === currentStatus
        const isCurrent = phase === currentStatus

        return (
          <div
            key={phase}
            className={cn(
              "rounded-[1.35rem] border p-3 transition-colors",
              isReached
                ? "border-white/65 bg-white/82 dark:border-white/12 dark:bg-white/10"
                : "border-white/50 bg-white/58 dark:border-white/8 dark:bg-white/4"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span
                className={cn(
                  "inline-flex size-2.5 rounded-full",
                  isCurrent
                    ? "bg-primary shadow-[0_0_0_6px_rgba(15,118,110,0.14)]"
                    : isReached
                      ? "bg-emerald-500/90"
                      : "bg-slate-300 dark:bg-slate-600"
                )}
              />
            </div>
            <div className="mt-4 text-sm font-semibold tracking-tight">
              {phase.charAt(0)}
              {phase.slice(1).toLowerCase()}
            </div>
            <div className="mt-1 text-xs text-foreground/60">
              {isCurrent
                ? "Current phase"
                : isReached
                  ? "Reached"
                  : "Pending"}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function InsightTile({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-3xl border border-white/50 bg-white/65 p-4 dark:border-white/8 dark:bg-white/5">
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span className="text-xs uppercase tracking-[0.22em]">{label}</span>
        <Icon className="size-4" />
      </div>
      <div className="mt-3 text-xl font-semibold tracking-tight">{value}</div>
    </div>
  )
}

function RunSummaryTile({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-3xl border border-white/50 bg-white/65 p-4 dark:border-white/8 dark:bg-white/5">
      <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-3 text-lg font-semibold tracking-tight">{value}</div>
      <div className="mt-2 break-all text-sm text-foreground/68">{detail}</div>
    </div>
  )
}

function ServiceChip({
  serviceType,
  value,
}: {
  serviceType: string
  value?: string
}) {
  const style = SERVICE_STYLES[serviceType] ?? SERVICE_STYLES.bell_pair

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium"
      style={{
        borderColor: style.glow,
        backgroundColor: style.fill,
        color: style.text,
        boxShadow: `0 10px 30px -18px ${style.glow}`,
      }}
    >
      <span className="size-2 rounded-full" style={{ backgroundColor: style.stroke }} />
      {formatServiceLabel(serviceType)}
      {value ? <span className="opacity-80">{value}</span> : null}
    </span>
  )
}

function StatusPill({
  status,
  label,
  className,
}: {
  status: JobStatus
  label?: string | null
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
        className ?? STATUS_STYLES[status]
      )}
    >
      <span className="size-2 rounded-full bg-current opacity-80" />
      {label ?? status}
    </span>
  )
}

function MiniDataCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-2xl border border-white/50 bg-white/70 p-4 dark:border-white/8 dark:bg-white/6">
      <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-3 text-sm font-semibold break-all">{value}</div>
      <div className="mt-2 text-xs break-all text-foreground/62">{detail}</div>
    </div>
  )
}

function InlineAlert({
  tone,
  title,
  description,
}: {
  tone: "warning" | "error"
  title: string
  description: string
}) {
  const iconClass = tone === "warning" ? "text-amber-600" : "text-rose-600"

  return (
    <div className="flex items-start gap-3 rounded-3xl border border-white/50 bg-white/65 p-4 dark:border-white/8 dark:bg-white/6">
      <CircleAlert className={cn("mt-0.5 size-4 shrink-0", iconClass)} />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-foreground/72">{description}</p>
      </div>
    </div>
  )
}

function EmptyHint({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center rounded-3xl border border-dashed border-white/60 bg-white/50 px-6 py-8 text-center dark:border-white/10 dark:bg-white/4">
      <div className="mb-3 flex size-11 items-center justify-center rounded-2xl border border-white/50 bg-white/70 text-primary dark:border-white/8 dark:bg-white/6">
        <Icon className="size-5" />
      </div>
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-2 max-w-md text-sm leading-6 text-foreground/62">
        {description}
      </div>
    </div>
  )
}

type DagFragmentNodeData = {
  fragmentId: string
  label: string
  serviceType: string
  qubits: number[]
  primaryNodeId: string | null
  fallbackCount: number
  status: string | null
  observedFidelity: number | null
  dependencyCount: number
  isFocused: boolean
}

type DagFragmentFlowNode = Node<DagFragmentNodeData, "fragment">

function DagFragmentNodeComponent({
  data,
  selected,
}: NodeProps<DagFragmentFlowNode>) {
  const style = SERVICE_STYLES[data.serviceType] ?? SERVICE_STYLES.bell_pair
  const isActive = selected || data.isFocused
  const statusLabel =
    data.status === "SUCCESS"
      ? "Completed"
      : data.status === "FAILED"
        ? "Failed"
        : data.status ?? "Pending"
  const statusClass =
    data.status === "SUCCESS"
      ? "border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-400/10 dark:text-emerald-200"
      : data.status === "FAILED"
        ? "border-rose-300/60 bg-rose-500/10 text-rose-700 dark:border-rose-500/30 dark:bg-rose-400/10 dark:text-rose-200"
        : "border-slate-300/60 bg-slate-500/10 text-slate-700 dark:border-slate-500/30 dark:bg-slate-400/10 dark:text-slate-200"

  return (
    <div
      className={cn(
        "w-[17.75rem] rounded-[1.85rem] border p-4 shadow-[0_28px_70px_-42px_rgba(15,23,42,0.36)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1",
        isActive
          ? "border-primary/40 bg-white/92 dark:border-primary/30 dark:bg-[#12243c]/96"
          : "border-white/60 bg-white/82 dark:border-white/10 dark:bg-[#0d192c]/88"
      )}
      style={{
        boxShadow: isActive ? `0 30px 72px -42px ${style.glow}` : undefined,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-0 !bg-white/0"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-0 !bg-white/0"
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {data.fragmentId}
          </div>
          <div className="mt-1 text-base font-semibold tracking-tight">{data.label}</div>
        </div>
        <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium", statusClass)}>
          {statusLabel}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className="rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em]"
          style={{
            color: style.text,
            borderColor: style.stroke,
            backgroundColor: style.fill,
          }}
        >
          {formatServiceLabel(data.serviceType)}
        </span>
        <span className="rounded-full border border-white/50 px-2.5 py-1 text-[10px] font-medium text-foreground/70 dark:border-white/10">
          q{data.qubits.join(", ")}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-white/45 bg-white/55 px-3 py-2 text-xs dark:border-white/8 dark:bg-white/6">
          <div className="uppercase tracking-[0.2em] text-muted-foreground">Route</div>
          <div className="mt-1 font-semibold">
            {data.primaryNodeId ? shortId(data.primaryNodeId, 8, 4) : "--"}
          </div>
        </div>
        <div className="rounded-2xl border border-white/45 bg-white/55 px-3 py-2 text-xs dark:border-white/8 dark:bg-white/6">
          <div className="uppercase tracking-[0.2em] text-muted-foreground">Observed</div>
          <div className="mt-1 font-semibold">{formatPercent(data.observedFidelity)}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <span>{data.dependencyCount} incoming edges</span>
        <span>{data.fallbackCount} fallbacks</span>
      </div>
    </div>
  )
}

const dagNodeTypes = {
  fragment: DagFragmentNodeComponent,
}

function buildDagFlowNodes({
  dagModel,
  selectedFragmentId,
}: {
  dagModel: DagModel
  selectedFragmentId: string | null
}) {
  return dagModel.nodes.map<DagFragmentFlowNode>((node) => ({
    id: node.fragmentId,
    type: "fragment",
    position: { x: node.x, y: node.y },
    draggable: true,
    data: {
      fragmentId: node.fragmentId,
      label: node.label,
      serviceType: node.serviceType,
      qubits: node.qubits,
      primaryNodeId: node.primaryNodeId,
      fallbackCount: node.fallbackNodeIds.length,
      status: node.status,
      observedFidelity: node.observedFidelity,
      dependencyCount: node.dependencies.length,
      isFocused: selectedFragmentId === node.fragmentId,
    },
  }))
}

function buildDagFlowEdges({
  dagModel,
  selectedFragmentId,
}: {
  dagModel: DagModel
  selectedFragmentId: string | null
}) {
  const nodeById = new Map(dagModel.nodes.map((node) => [node.fragmentId, node]))

  return dagModel.edges.map<Edge>((edge) => {
    const sourceNode = nodeById.get(edge.from)
    const sourceStyle =
      SERVICE_STYLES[sourceNode?.serviceType ?? "bell_pair"] ?? SERVICE_STYLES.bell_pair
    const isFocused =
      selectedFragmentId !== null &&
      (selectedFragmentId === edge.from || selectedFragmentId === edge.to)

    return {
      id: `dag-edge-${edge.from}-${edge.to}`,
      source: edge.from,
      target: edge.to,
      type: "bezier",
      animated: isFocused,
      style: {
        stroke: isFocused ? sourceStyle.stroke : "rgba(71, 85, 105, 0.32)",
        strokeWidth: isFocused ? 2.8 : 1.8,
        strokeDasharray: isFocused ? undefined : "10 8",
      },
    }
  })
}

function DagBoard({
  dagModel,
  selectedFragmentId,
  onSelectFragment,
}: {
  dagModel: DagModel | null
  selectedFragmentId: string | null
  onSelectFragment: (fragmentId: string) => void
}) {
  const baseFlowNodes = useMemo(
    () =>
      dagModel ? buildDagFlowNodes({ dagModel, selectedFragmentId }) : [],
    [dagModel, selectedFragmentId]
  )
  const [flowNodes, setFlowNodes, onNodesChange] =
    useNodesState<DagFragmentFlowNode>(baseFlowNodes)

  useEffect(() => {
    setFlowNodes((currentNodes) => {
      const currentById = new Map(currentNodes.map((node) => [node.id, node]))

      return baseFlowNodes.map((node) => {
        const currentNode = currentById.get(node.id)
        if (!currentNode) {
          return node
        }

        return {
          ...node,
          position: currentNode.position,
        }
      })
    })
  }, [baseFlowNodes, setFlowNodes])

  const flowEdges = useMemo(
    () =>
      dagModel
        ? buildDagFlowEdges({
            dagModel,
            selectedFragmentId,
          })
        : [],
    [dagModel, selectedFragmentId]
  )

  if (!dagModel) {
    return (
      <EmptyHint
        icon={Workflow}
        title="No plan graph yet"
        description="Submit a circuit and the planner will project each fragment into a routing graph here."
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/50 bg-white/68 shadow-inner shadow-black/5 dark:border-white/8 dark:bg-black/15">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/45 bg-white/48 px-4 py-3 dark:border-white/8 dark:bg-white/4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Interactive fragment DAG
          </div>
          <div className="mt-1 text-sm text-foreground/68">
            Drag fragments to inspect the execution order and dependency fan-out.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-full px-3 py-1">
            {dagModel.nodes.length} fragments
          </Badge>
          <Badge variant="outline" className="rounded-full px-3 py-1">
            {dagModel.edges.length} dependencies
          </Badge>
        </div>
      </div>
      <div className="relative h-[36rem] overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-8 top-8 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(20,184,166,0.12),transparent_72%)] blur-2xl" />
          <div className="absolute right-10 top-12 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.12),transparent_74%)] blur-3xl" />
          <div className="absolute bottom-10 left-1/3 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.1),transparent_72%)] blur-3xl" />
        </div>
        <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-wrap gap-2">
          <div className="rounded-full border border-white/55 bg-white/78 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/72 shadow-sm dark:border-white/10 dark:bg-[#0d1a2b]/88">
            Planner layout
          </div>
          <div className="rounded-full border border-white/55 bg-white/78 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/72 shadow-sm dark:border-white/10 dark:bg-[#0d1a2b]/88">
            Drag enabled
          </div>
        </div>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={dagNodeTypes}
          onNodesChange={onNodesChange}
          nodesDraggable
          nodesConnectable={false}
          panOnDrag={false}
          selectionOnDrag={false}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.55}
          maxZoom={1.4}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => {
            if (node.type === "fragment") {
              onSelectFragment(node.id)
            }
          }}
          className="bg-transparent"
        >
          <Background gap={26} size={1} color="rgba(148,163,184,0.16)" />
          <Controls showInteractive={false} position="top-right" />
        </ReactFlow>
      </div>
    </div>
  )
}

function CandidateRow({
  candidate,
  isPrimary,
}: {
  candidate: PlanCandidate
  isPrimary: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border p-4",
        isPrimary
          ? "border-primary/30 bg-primary/6"
          : "border-white/60 bg-white/65 dark:border-white/8 dark:bg-white/4"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            {isPrimary ? "Primary route" : "Fallback route"}
          </div>
          <div className="mt-1 font-mono text-sm break-all">{candidate.node_id}</div>
        </div>
        <Badge variant="outline" className="rounded-full">
          {formatPercent(candidate.fidelity)}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <MiniDataCard
          label="Total"
          value={candidate.total_cost.toFixed(3)}
          detail="Planner score"
        />
        <MiniDataCard
          label="Latency"
          value={candidate.latency_cost.toFixed(3)}
          detail="Latency cost"
        />
        <MiniDataCard
          label="Failure risk"
          value={candidate.failure_risk_cost.toFixed(3)}
          detail="Risk component"
        />
        <MiniDataCard
          label="Load"
          value={candidate.load_cost.toFixed(3)}
          detail="Load component"
        />
      </div>
    </div>
  )
}

function ChartCard({
  title,
  subtitle,
  data,
  emptyMessage,
  config,
  dataKey,
  labelKey,
  fill,
  valueFormatter,
}: {
  title: string
  subtitle: string
  data: Array<Record<string, number | string>>
  emptyMessage: string
  config: typeof measurementChartConfig
  dataKey: string
  labelKey: string
  fill: string
  valueFormatter: (value: number) => string
}) {
  return (
    <div className="rounded-3xl border border-white/50 bg-white/65 p-4 dark:border-white/8 dark:bg-black/15">
      <div className="mb-4">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {data.length > 0 ? (
        <ChartContainer className="h-[16rem] w-full" config={config}>
          <BarChart data={data} margin={{ left: 8, right: 12, top: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 6" />
            <XAxis dataKey={labelKey} />
            <YAxis />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
              formatter={(value) => valueFormatter(Number(value))}
            />
            <Bar dataKey={dataKey} fill={fill} radius={[10, 10, 2, 2]} />
          </BarChart>
        </ChartContainer>
      ) : (
        <EmptyHint icon={CheckCircle2} title={title} description={emptyMessage} />
      )}
    </div>
  )
}

function ProgressStat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono">{formatPercent(value)}</span>
      </div>
      <Progress value={Math.max(0, Math.min(100, (value ?? 0) * 100))} className="h-2" />
    </div>
  )
}

function AxisMeter({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.22em] text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono text-foreground/75">{value.toFixed(3)}</span>
      </div>
      <div className="h-2 rounded-full bg-white/70 dark:bg-white/8">
        <div
          className="h-full rounded-full transition-[width]"
          style={{
            width: `${Math.max(0, Math.min(100, ((value + 1) / 2) * 100))}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  )
}

function scrollToSection(sectionId: string) {
  document.getElementById(sectionId)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  })
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return "Something went wrong while talking to the backend."
}

export default App
