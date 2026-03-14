from __future__ import annotations

from dataclasses import replace
from datetime import timedelta
from pathlib import Path

import pytest

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.infra.persistence import SQLiteRuntimeEventStore
from quantum_coordinator.planning import CircuitPlanner, PlannerConfig, PlannerWeights
from quantum_coordinator.reservation.protocol import ReservationProtocol
from quantum_coordinator.runtime import RuntimeExecutor, RuntimePolicy
from quantum_coordinator.service_discovery.advertisement import ServiceAdvertisement
from quantum_coordinator.service_discovery.registry import ServiceRegistry
from tests.support.runtime_test_adapter import (
    InjectedFailure,
    InMemoryGateExecutionAdapter,
    NodeExecutionProfile,
)


def _make_registry() -> ServiceRegistry:
    registry = ServiceRegistry(stale_after=timedelta(seconds=60))
    registry.upsert(
        ServiceAdvertisement(
            node_id="node-primary",
            service_type=GateType.CNOT,
            fidelity=0.95,
            qubit_min=1,
            qubit_max=3,
            availability=True,
        )
    )
    registry.upsert(
        ServiceAdvertisement(
            node_id="node-fallback",
            service_type=GateType.CNOT,
            fidelity=0.94,
            qubit_min=1,
            qubit_max=3,
            availability=True,
        )
    )
    return registry


def _make_plan(registry: ServiceRegistry):
    planner = CircuitPlanner(
        registry=registry,
        config=PlannerConfig(
            min_fidelity=0.8,
            fallback_count=1,
            seed=1,
            weights=PlannerWeights(w_lat=0.0, w_fail=0.0, w_ent=0.0, w_load=0.0),
        ),
    )
    circuit = """
OPENQASM 2.0;
qreg q[2];
cx q[0], q[1];
"""
    plan = planner.compile(circuit)

    fragment_id = plan.fragment_order[0]
    assignment = plan.assignments[fragment_id]
    assignment = replace(
        assignment,
        primary_node_id="node-primary",
        fallback_node_ids=("node-fallback",),
    )
    assignments = dict(plan.assignments)
    assignments[fragment_id] = assignment
    return fragment_id, replace(plan, assignments=assignments)


def _make_runtime_components(tmp_path: Path):
    store = SQLiteRuntimeEventStore(str(tmp_path / "runtime.db"))
    reservation = ReservationProtocol(
        registry=_make_registry(),
        default_window=timedelta(seconds=1),
        store=store,
    )
    adapter = InMemoryGateExecutionAdapter(
        profiles={
            "node-primary": NodeExecutionProfile(fidelity=0.95),
            "node-fallback": NodeExecutionProfile(fidelity=0.94),
        }
    )
    return store, reservation, adapter


@pytest.mark.anyio
async def test_runtime_timeout_then_fallback_success(tmp_path: Path) -> None:
    registry = _make_registry()
    fragment_id, plan = _make_plan(registry)
    store, reservation, adapter = _make_runtime_components(tmp_path)

    adapter.inject("node-primary", InjectedFailure.TIMEOUT)

    executor = RuntimeExecutor(
        reservation_protocol=reservation,
        gate_adapter=adapter,
        policy=RuntimePolicy(max_retries=1, timeout_seconds=0.05, seed=3),
        store=store,
    )

    result = await executor.execute(job_id="job-timeout", plan=plan)

    fragment = next(fr for fr in result.fragment_results if fr.fragment_id == fragment_id)
    assert fragment.status.value == "SUCCESS"
    assert fragment.node_id == "node-fallback"

    events = store.list_fragment_events("job-timeout")
    assert any(evt.status == "TIMEOUT" for evt in events)


@pytest.mark.anyio
async def test_runtime_reject_then_fallback_success(tmp_path: Path) -> None:
    registry = _make_registry()
    fragment_id, plan = _make_plan(registry)
    store, reservation, adapter = _make_runtime_components(tmp_path)

    adapter.inject("node-primary", InjectedFailure.REJECT)

    executor = RuntimeExecutor(
        reservation_protocol=reservation,
        gate_adapter=adapter,
        policy=RuntimePolicy(max_retries=1, timeout_seconds=0.1, seed=4),
        store=store,
    )

    result = await executor.execute(job_id="job-reject", plan=plan)

    fragment = next(fr for fr in result.fragment_results if fr.fragment_id == fragment_id)
    assert fragment.status.value == "SUCCESS"
    assert fragment.node_id == "node-fallback"


@pytest.mark.anyio
async def test_runtime_node_drop_then_fallback_success(tmp_path: Path) -> None:
    registry = _make_registry()
    fragment_id, plan = _make_plan(registry)
    store, reservation, adapter = _make_runtime_components(tmp_path)

    adapter.inject("node-primary", InjectedFailure.NODE_DROP)

    executor = RuntimeExecutor(
        reservation_protocol=reservation,
        gate_adapter=adapter,
        policy=RuntimePolicy(max_retries=1, timeout_seconds=0.1, seed=5),
        store=store,
    )

    result = await executor.execute(job_id="job-drop", plan=plan)

    fragment = next(fr for fr in result.fragment_results if fr.fragment_id == fragment_id)
    assert fragment.status.value == "SUCCESS"
    assert fragment.node_id == "node-fallback"


@pytest.mark.anyio
async def test_runtime_quality_degraded_then_fallback_success(tmp_path: Path) -> None:
    registry = _make_registry()
    fragment_id, plan = _make_plan(registry)
    store, reservation, adapter = _make_runtime_components(tmp_path)

    adapter.inject("node-primary", InjectedFailure.QUALITY_DEGRADED)

    executor = RuntimeExecutor(
        reservation_protocol=reservation,
        gate_adapter=adapter,
        policy=RuntimePolicy(max_retries=1, timeout_seconds=0.1, min_fidelity=0.8, seed=6),
        store=store,
    )

    result = await executor.execute(job_id="job-quality", plan=plan)

    fragment = next(fr for fr in result.fragment_results if fr.fragment_id == fragment_id)
    assert fragment.status.value == "SUCCESS"
    assert fragment.node_id == "node-fallback"

    events = store.list_fragment_events("job-quality")
    assert any(evt.status == "QUALITY_DEGRADED" for evt in events)
