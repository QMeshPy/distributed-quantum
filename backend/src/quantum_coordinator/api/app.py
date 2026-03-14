"""FastAPI application assembly."""

from __future__ import annotations

import asyncio
import logging
import time
from contextlib import suppress
from datetime import timedelta

import anyio
from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware

from quantum_coordinator import __version__
from quantum_coordinator.api.models import (
    CircuitSubmitRequest,
    CircuitSubmitResponse,
    FidelityMetricsResponse,
    FidelitySampleResponse,
    HealthResponse,
    JobProgressResponse,
    JobResult,
    JobStatusResponse,
    JobUpdateResponse,
    ServiceResponse,
)
from quantum_coordinator.application.job_manager import JobManager
from quantum_coordinator.config.models import AppConfig
from quantum_coordinator.domain.models import JobStatus
from quantum_coordinator.infra.libp2p.fabric import PyLibp2pFabric
from quantum_coordinator.infra.libp2p.protocols import SERVICE_AD_TOPIC_DEFAULT
from quantum_coordinator.infra.persistence import (
    SQLiteJobStore,
    SQLiteRuntimeEventStore,
    SQLiteServiceRegistryStore,
    run_sqlite_migrations,
)
from quantum_coordinator.planning import CircuitPlanner, PlannerConfig
from quantum_coordinator.planning.models import (
    CircuitFragment,
    ExecutionPlan,
    FragmentAssignment,
)
from quantum_coordinator.reservation.protocol import ReservationProtocol
from quantum_coordinator.runtime import (
    GateExecutionAdapter,
    Libp2pGateExecutionAdapter,
    LocalGateExecutionAdapter,
    RuntimePolicy,
)
from quantum_coordinator.service_discovery.registry import ServiceRegistry

logger = logging.getLogger(__name__)


class InMemoryRateLimiter:
    """Simple per-minute fixed-window limiter."""

    def __init__(self, limit_per_minute: int) -> None:
        self._limit = limit_per_minute
        self._counts: dict[tuple[str, int], int] = {}
        self._lock = anyio.Lock()

    async def allow(self, key: str) -> bool:
        current_window = int(time.time() // 60)
        async with self._lock:
            self._counts = {
                bucket: count
                for bucket, count in self._counts.items()
                if bucket[1] >= current_window
            }
            bucket = (key, current_window)
            next_count = self._counts.get(bucket, 0) + 1
            self._counts[bucket] = next_count
            return next_count <= self._limit


def create_app(config: AppConfig) -> FastAPI:
    """Create and configure FastAPI app instance."""
    app = FastAPI(
        title="Distributed Quantum Services",
        version=__version__,
        docs_url="/docs",
        redoc_url="/redoc",
    )
    app.state.started_monotonic = time.monotonic()
    app.state.config = config
    run_sqlite_migrations(config.database.path)

    registry_store = SQLiteServiceRegistryStore(config.database.path)
    runtime_store = SQLiteRuntimeEventStore(config.database.path)
    job_store = SQLiteJobStore(config.database.path)
    registry = ServiceRegistry(
        stale_after=timedelta(seconds=config.discovery.stale_timeout_seconds),
        store=registry_store,
    )
    planner = CircuitPlanner(registry=registry, config=PlannerConfig())
    reservation = ReservationProtocol(
        registry=registry,
        default_window=timedelta(seconds=config.runtime.base_timeout_seconds),
        store=runtime_store,
    )
    runtime_policy = RuntimePolicy(
        max_retries=config.runtime.max_retries,
        timeout_seconds=config.runtime.base_timeout_seconds,
        backoff_multiplier=config.runtime.backoff_multiplier,
    )

    libp2p_fabric: PyLibp2pFabric | None = None
    gate_adapter: GateExecutionAdapter
    if config.libp2p.enabled:
        libp2p_fabric = PyLibp2pFabric(
            coordinator_listen_addrs=config.libp2p.coordinator_listen_addrs,
            topic=config.discovery.service_ad_topic or SERVICE_AD_TOPIC_DEFAULT,
            gate_protocol_id=config.libp2p.gate_protocol_id,
            embedded_service_count=config.libp2p.embedded_service_count,
            embedded_service_base_port=config.libp2p.embedded_service_base_port,
            embedded_ad_interval_seconds=config.libp2p.embedded_ad_interval_seconds,
            enable_mdns=config.libp2p.enable_mdns,
            registry=registry,
        )
        gate_adapter = Libp2pGateExecutionAdapter(invoker=libp2p_fabric)
    else:
        logger.warning(
            "libp2p.enabled is false; starting coordinator with local in-process gate execution"
        )
        gate_adapter = LocalGateExecutionAdapter()
    job_manager = JobManager(
        planner=planner,
        reservation_protocol=reservation,
        runtime_policy=runtime_policy,
        runtime_store=runtime_store,
        job_store=job_store,
        gate_adapter=gate_adapter,
    )
    app.state.job_manager = job_manager
    app.state.job_store = job_store
    app.state.runtime_store = runtime_store
    app.state.registry = registry
    app.state.libp2p_fabric = libp2p_fabric
    app.state.discovery_task = None

    rate_limiter = InMemoryRateLimiter(config.api.rate_limit_per_minute)

    if config.api.enable_cors:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=config.api.cors_origins,
            allow_methods=["*"],
            allow_headers=["*"],
            allow_credentials=True,
        )

    async def enforce_request_policy(
        request: Request,
        x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    ) -> None:
        if config.api.enable_auth:
            expected = config.api.api_key
            if not expected:
                raise HTTPException(status_code=503, detail="API auth enabled but API key not set")
            if x_api_key != expected:
                raise HTTPException(status_code=401, detail="Invalid API key")

        if config.api.enable_rate_limit:
            client_host = (
                request.client.host
                if request.client is not None and request.client.host
                else "unknown"
            )
            allowed = await rate_limiter.allow(client_host)
            if not allowed:
                raise HTTPException(status_code=429, detail="Rate limit exceeded")

    async def enforce_websocket_policy(websocket: WebSocket) -> bool:
        if config.api.enable_auth:
            expected = config.api.api_key
            provided = websocket.headers.get("x-api-key")
            if not expected or provided != expected:
                await websocket.close(code=4401)
                return False

        if config.api.enable_rate_limit:
            client_host = (
                websocket.client.host
                if websocket.client is not None and websocket.client.host
                else "unknown"
            )
            allowed = await rate_limiter.allow(client_host)
            if not allowed:
                await websocket.close(code=4429)
                return False
        return True

    async def ingest_discovery_ads() -> None:
        while True:
            if libp2p_fabric is None:
                await anyio.sleep(1.0)
                continue
            advertisement = await libp2p_fabric.next_advertisement(timeout_seconds=1.0)
            if advertisement is None:
                continue
            registry.upsert(advertisement)

    @app.on_event("startup")
    async def startup_recovery() -> None:
        registry.prune_stale()
        if libp2p_fabric is not None:
            # Cached ads can outlive the peers that produced them across a
            # coordinator restart, so force them unavailable until re-announced.
            registry.mark_all_unavailable()
            try:
                await libp2p_fabric.start()
            except Exception:
                logger.exception("py-libp2p startup failed; refusing to start without libp2p")
                raise
            else:
                for advertisement in libp2p_fabric.available_advertisements():
                    registry.upsert(advertisement)
                app.state.discovery_task = asyncio.create_task(ingest_discovery_ads())
        await job_manager.recover_unfinished_jobs()

    @app.on_event("shutdown")
    async def shutdown_libp2p() -> None:
        discovery_task = app.state.discovery_task
        if discovery_task is not None:
            discovery_task.cancel()
            with suppress(asyncio.CancelledError):
                await discovery_task
            app.state.discovery_task = None

        fabric = app.state.libp2p_fabric
        if fabric is not None:
            await fabric.stop()

    @app.get("/api/v1/health", response_model=HealthResponse, tags=["system"])
    async def health() -> HealthResponse:
        uptime = time.monotonic() - app.state.started_monotonic
        return HealthResponse(
            status="ok",
            service=config.logging.service_name,
            version=__version__,
            environment=config.environment,
            uptime_seconds=uptime,
        )

    @app.post(
        "/api/v1/circuits/submit",
        response_model=CircuitSubmitResponse,
        tags=["jobs"],
        dependencies=[Depends(enforce_request_policy)],
    )
    async def submit_circuit(
        payload: CircuitSubmitRequest,
        background_tasks: BackgroundTasks,
    ) -> CircuitSubmitResponse:
        payload_size = len(payload.circuit.encode("utf-8"))
        if payload_size > config.api.max_request_bytes:
            raise HTTPException(status_code=413, detail="Circuit payload too large")

        job = job_manager.submit(payload.circuit)
        background_tasks.add_task(job_manager.process, job.job_id)
        return CircuitSubmitResponse(job_id=job.job_id, status=job.status.value)

    @app.get(
        "/api/v1/jobs/{job_id}",
        response_model=JobStatusResponse,
        tags=["jobs"],
        dependencies=[Depends(enforce_request_policy)],
    )
    async def get_job(job_id: str) -> JobStatusResponse:
        job = job_manager.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")

        result_payload: JobResult | None = None
        if job.result_json is not None:
            # Older records may not contain quantum_result; Pydantic will
            # ignore unknown/missing fields and still validate.
            result_payload = JobResult.model_validate_json(job.result_json)
        else:
            live_fragment_results = job_manager.get_live_fragment_results(job.job_id, job.plan_id)
            if live_fragment_results is not None:
                result_payload = JobResult(
                    job_id=job.job_id,
                    fragment_results=live_fragment_results,
                    quantum_result=None,
                )

        progress_snapshot = job_manager.get_progress(job.job_id, job.plan_id, job.status)
        progress_payload = (
            None
            if progress_snapshot is None
            else JobProgressResponse(
                total_fragments=progress_snapshot.total_fragments,
                completed_fragments=progress_snapshot.completed_fragments,
                active_fragments=progress_snapshot.active_fragments,
                completion_ratio=progress_snapshot.completion_ratio,
                latest_event_at=progress_snapshot.latest_event_at,
                finalizing=progress_snapshot.finalizing,
            )
        )

        return JobStatusResponse(
            job_id=job.job_id,
            status=job.status.value,
            plan_id=job.plan_id,
            error=job.error,
            result=result_payload,
            progress=progress_payload,
            created_at=job.created_at,
            updated_at=job.updated_at,
        )

    def _fragment_to_response(fragment: CircuitFragment) -> dict[str, object]:
        return {
            "fragment_id": fragment.fragment_id,
            "service_type": fragment.service_type.value,
            "qubits": list(fragment.qubits),
            "operation_ids": list(fragment.operation_ids),
            "dependencies": list(fragment.dependencies),
        }

    def _assignment_to_response(assignment: FragmentAssignment) -> dict[str, object]:
        return {
            "fragment_id": assignment.fragment_id,
            "primary_node_id": assignment.primary_node_id,
            "fallback_node_ids": list(assignment.fallback_node_ids),
            "candidates": [
                {
                    "node_id": c.node_id,
                    "total_cost": c.total_cost,
                    "latency_cost": c.latency_cost,
                    "failure_risk_cost": c.failure_risk_cost,
                    "entanglement_cost": c.entanglement_cost,
                    "load_cost": c.load_cost,
                    "fidelity": c.fidelity,
                }
                for c in assignment.candidates
            ],
        }

    @app.get(
        "/api/v1/plans/{plan_id}",
        tags=["jobs"],
        dependencies=[Depends(enforce_request_policy)],
    )
    async def get_plan(plan_id: str) -> dict[str, object]:
        """Expose the compiled execution plan for a job."""
        plan: ExecutionPlan | None = job_manager.get_plan(plan_id)
        if plan is None:
            raise HTTPException(status_code=404, detail="Plan not found")

        return {
            "plan_id": plan.plan_id,
            "fragment_order": list(plan.fragment_order),
            "fragments": {
                fragment_id: _fragment_to_response(fragment)
                for fragment_id, fragment in plan.fragments.items()
            },
            "assignments": {
                fragment_id: _assignment_to_response(assignment)
                for fragment_id, assignment in plan.assignments.items()
            },
            "quality_snapshot_id": plan.quality_snapshot_id,
        }

    @app.get(
        "/api/v1/services",
        response_model=list[ServiceResponse],
        tags=["services"],
        dependencies=[Depends(enforce_request_policy)],
    )
    async def get_services() -> list[ServiceResponse]:
        return [
            ServiceResponse(
                node_id=ad.node_id,
                listen_addrs=list(ad.listen_addrs),
                service_type=ad.service_type.value,
                fidelity=ad.fidelity,
                qubit_min=ad.qubit_min,
                qubit_max=ad.qubit_max,
                availability=ad.availability,
                updated_at=ad.updated_at,
            )
            for ad in registry.query(available_only=False)
        ]

    @app.get(
        "/api/v1/metrics/fidelity/{node_id}",
        response_model=FidelityMetricsResponse,
        tags=["metrics"],
        dependencies=[Depends(enforce_request_policy)],
    )
    async def get_fidelity_metrics(node_id: str) -> FidelityMetricsResponse:
        ads = [
            entry.advertisement
            for entry in registry.all_entries()
            if entry.advertisement.node_id == node_id
        ]
        if not ads:
            raise HTTPException(status_code=404, detail="Node not found")

        fidelities = [ad.fidelity for ad in ads]
        samples = [
            FidelitySampleResponse(
                service_type=ad.service_type.value,
                fidelity=ad.fidelity,
                availability=ad.availability,
                updated_at=ad.updated_at,
            )
            for ad in sorted(ads, key=lambda item: item.service_type.value)
        ]
        return FidelityMetricsResponse(
            node_id=node_id,
            sample_count=len(samples),
            average_fidelity=sum(fidelities) / len(fidelities),
            min_fidelity=min(fidelities),
            max_fidelity=max(fidelities),
            samples=samples,
        )

    @app.websocket("/api/v1/jobs/{job_id}/ws")
    async def stream_job_updates(job_id: str, websocket: WebSocket) -> None:
        if not await enforce_websocket_policy(websocket):
            return

        await websocket.accept()
        previous_payload: dict[str, object] | None = None
        try:
            while True:
                job = job_manager.get(job_id)
                if job is None:
                    await websocket.close(code=4404)
                    return

                progress_snapshot = job_manager.get_progress(job.job_id, job.plan_id, job.status)
                payload = JobUpdateResponse(
                    job_id=job.job_id,
                    status=job.status.value,
                    error=job.error,
                    progress=(
                        None
                        if progress_snapshot is None
                        else JobProgressResponse(
                            total_fragments=progress_snapshot.total_fragments,
                            completed_fragments=progress_snapshot.completed_fragments,
                            active_fragments=progress_snapshot.active_fragments,
                            completion_ratio=progress_snapshot.completion_ratio,
                            latest_event_at=progress_snapshot.latest_event_at,
                            finalizing=progress_snapshot.finalizing,
                        )
                    ),
                    updated_at=job.updated_at,
                ).model_dump(mode="json")
                if payload != previous_payload:
                    await websocket.send_json(payload)
                    previous_payload = payload

                if job.status in {JobStatus.COMPLETED, JobStatus.FAILED}:
                    await websocket.close(code=1000)
                    return

                await anyio.sleep(0.2)
        except WebSocketDisconnect:
            return

    return app
