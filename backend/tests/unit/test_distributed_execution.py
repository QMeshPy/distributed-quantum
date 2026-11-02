"""Unit tests for distributed fragment execution helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, create_autospec

import pytest

from quantum_backend_v2.application.distributed_statevector import (
    apply_fragment_to_state,
    combine_handoffs,
    make_initial_state_handoff,
    summarize_state_handoff,
)
from quantum_backend_v2.application.quantum_bridge import QuantumExecutionBridge
from quantum_backend_v2.reservations.service import ReservationService
from quantum_backend_v2.runtime.service import ExecutionService
from quantum_backend_v2.discovery.registry import PeerRegistryEntry
from quantum_backend_v2.libp2p.fragment_worker import PeerFragmentWorker
from quantum_backend_v2.libp2p.protocol_ids import build_execution_protocol_ids
from quantum_backend_v2.protocols.execution import (
    ExecutionResultPayload,
    ExecutionTransition,
    FragmentDescriptor,
    FragmentDispatchInput,
    FragmentDispatchOutput,
    FragmentDispatchRequest,
)
from quantum_backend_v2.protocols.reservation import (
    ReservationCommitRequest,
    ReservationCommitResponse,
    ReservationPrepareRequest,
    ReservationPrepareResponse,
    ReservationTransition,
)

pytestmark = pytest.mark.anyio


class _FakeDiscoveryService:
    def __init__(self, *, peers: list[PeerRegistryEntry], workers: dict[str, PeerFragmentWorker]) -> None:
        self._peers = peers
        self._workers = workers
        self._protocol_ids = build_execution_protocol_ids("test-ns")
        self.registry = SimpleNamespace(
            list_peers=lambda include_stale=False: list(peers),
            get_peer=lambda peer_id: next((peer for peer in peers if peer.peer_id == peer_id), None),
        )

    async def wait_for_service_peers(self, *, timeout_seconds: float = 10.0) -> list[PeerRegistryEntry]:
        return list(self._peers)

    async def request_peer_rpc(
        self,
        *,
        peer_id: str,
        protocol_id: str,
        payload: bytes,
        peer_addresses: tuple[str, ...] = (),
        timeout_seconds: float = 15.0,
    ) -> bytes:
        worker = self._workers[peer_id]
        if protocol_id == self._protocol_ids.reservation_prepare:
            return await worker.handle_prepare(payload)
        if protocol_id == self._protocol_ids.reservation_commit:
            return await worker.handle_commit(payload)
        if protocol_id == self._protocol_ids.reservation_cancel:
            return await worker.handle_cancel(payload)
        if protocol_id == self._protocol_ids.fragment_dispatch:
            return await worker.handle_dispatch(payload)
        raise AssertionError(f"Unexpected protocol_id {protocol_id}")


def test_apply_fragment_to_state_generates_expected_superposition() -> None:
    output = apply_fragment_to_state(
        fragment=FragmentDescriptor(
            fragment_id="frag-1",
            service_id="hadamard",
            qubits=(0,),
            operation_ids=("op-1",),
            dependencies=(),
            raw_text="h q[0];",
        ),
        state=make_initial_state_handoff(1),
        previous_peer_id="peer-a",
    )

    summary = summarize_state_handoff(output.state)
    probabilities = summary["probabilities"]
    assert probabilities["0"] == pytest.approx(0.5)
    assert probabilities["1"] == pytest.approx(0.5)
    assert output.state.previous_peer_id == "peer-a"


def test_combine_handoffs_preserves_factorized_state() -> None:
    left = apply_fragment_to_state(
        fragment=FragmentDescriptor(
            fragment_id="frag-left",
            service_id="hadamard",
            qubits=(0,),
            operation_ids=("op-left",),
            dependencies=(),
            raw_text="h q[0];",
        ),
        state=make_initial_state_handoff(1, qubit_ids=(0,)),
        previous_peer_id="peer-a",
    ).state
    right = make_initial_state_handoff(1, qubit_ids=(1,))

    combined = combine_handoffs((left, right))
    probabilities = summarize_state_handoff(combined)["probabilities"]
    assert probabilities["00"] == pytest.approx(0.5)
    assert probabilities["01"] == pytest.approx(0.5)
    assert combined.qubit_ids == (0, 1)


async def test_peer_fragment_worker_executes_prepared_fragment() -> None:
    worker = PeerFragmentWorker(peer_id="peer-a", max_concurrent_slots=1)
    reservation_id = "res-12345678"
    execution_id = "exec-12345678"

    prepare_response = ReservationPrepareResponse.model_validate_json(
        await worker.handle_prepare(
            ReservationPrepareRequest(
                reservation_id=reservation_id,
                workflow_run_id="job-12345678",
                fragment_id="frag-1",
                requesting_peer_id="coordinator-peer",
                service_id="hadamard",
                estimated_qubits=1,
                estimated_depth=1,
                idempotency_key="idem-prepare-12345678",
            ).model_dump_json().encode("utf-8")
        )
    )
    assert prepare_response.transition == ReservationTransition.ACCEPTED

    commit_response = ReservationCommitResponse.model_validate_json(
        await worker.handle_commit(
            ReservationCommitRequest(
                reservation_id=reservation_id,
                workflow_run_id="job-12345678",
                fragment_id="frag-1",
            ).model_dump_json().encode("utf-8")
        )
    )
    assert commit_response.transition == ReservationTransition.COMMITTED

    dispatch_input = FragmentDispatchInput(
        plan_id="plan-12345678",
        fragment=FragmentDescriptor(
            fragment_id="frag-1",
            service_id="hadamard",
            qubits=(0,),
            operation_ids=("op-1",),
            dependencies=(),
            raw_text="h q[0];",
        ),
        state=make_initial_state_handoff(1),
    )
    execution_response = ExecutionResultPayload.model_validate_json(
        await worker.handle_dispatch(
            FragmentDispatchRequest(
                execution_id=execution_id,
                reservation_id=reservation_id,
                workflow_run_id="job-12345678",
                fragment_id="frag-1",
                service_id="hadamard",
                input_payload=dispatch_input.model_dump(mode="json"),
                idempotency_key="idem-dispatch-12345678",
            ).model_dump_json().encode("utf-8")
        )
    )
    assert execution_response.transition == ExecutionTransition.COMPLETED

    output = FragmentDispatchOutput.model_validate(execution_response.output_payload)
    summary = summarize_state_handoff(output.state)
    probabilities = summary["probabilities"]
    assert probabilities["0"] == pytest.approx(0.5)
    assert probabilities["1"] == pytest.approx(0.5)
    assert worker.heartbeat_snapshot() == (0, 0)


def test_quantum_bridge_groups_entangled_stage_into_single_block() -> None:
    now = datetime.now(timezone.utc)
    peers = [
        PeerRegistryEntry(
            peer_id="12D3KooWPeerA",
            trust_tier="platform_managed",
            health_status="healthy",
            network_addresses=("/ip4/127.0.0.1/tcp/4101",),
            supported_protocols=(),
            service_ids=("hadamard", "cz", "measurement_feedforward"),
            last_seen_at=now,
        ),
        PeerRegistryEntry(
            peer_id="12D3KooWPeerB",
            trust_tier="platform_managed",
            health_status="healthy",
            network_addresses=("/ip4/127.0.0.1/tcp/4102",),
            supported_protocols=(),
            service_ids=("hadamard", "cz", "measurement_feedforward"),
            last_seen_at=now,
        ),
    ]

    fake_discovery_service = SimpleNamespace(
        registry=SimpleNamespace(
            list_peers=lambda include_stale=False: list(peers),
            get_peer=lambda peer_id: next((peer for peer in peers if peer.peer_id == peer_id), None),
        )
    )
    fake_runtime = SimpleNamespace(
        settings=SimpleNamespace(rendezvous_namespace="test-ns", dev_service_peer_count=2),
        host=MagicMock(),
    )
    fake_runtime.host.get_id.return_value = "12D3KooWCoordinator"

    bridge = QuantumExecutionBridge(
        discovery_service=fake_discovery_service,
        libp2p_runtime=fake_runtime,
    )
    plan = bridge.compile_plan(
        "\n".join(
            [
                "OPENQASM 2.0;",
                'include "qelib1.inc";',
                "qreg q[2];",
                "creg c[2];",
                "h q[0];",
                "h q[1];",
                "cz q[0],q[1];",
                "h q[0];",
                "h q[1];",
            ]
        )
    )

    assert len(plan.stages) == 3
    final_stage = plan.stages[2]
    assert len(final_stage.block_ids) == 1
    block = plan.blocks[final_stage.block_ids[0]]
    assert block.fragment_ids == ("frag-0004", "frag-0005")
    assert block.state_qubits == (0, 1)
    assert plan.assignments["frag-0004"].block_id == block.block_id
    assert plan.assignments["frag-0005"].block_id == block.block_id


def test_quantum_bridge_merges_same_stage_blocks_with_overlapping_live_components() -> None:
    now = datetime.now(timezone.utc)
    peers = [
        PeerRegistryEntry(
            peer_id="12D3KooWPeerA",
            trust_tier="platform_managed",
            health_status="healthy",
            network_addresses=("/ip4/127.0.0.1/tcp/4101",),
            supported_protocols=(),
            service_ids=("hadamard", "cz", "measurement_feedforward", "subcircuit_bundle"),
            last_seen_at=now,
        ),
        PeerRegistryEntry(
            peer_id="12D3KooWPeerB",
            trust_tier="platform_managed",
            health_status="healthy",
            network_addresses=("/ip4/127.0.0.1/tcp/4102",),
            supported_protocols=(),
            service_ids=("hadamard", "cz", "measurement_feedforward", "subcircuit_bundle"),
            last_seen_at=now,
        ),
    ]

    fake_discovery_service = SimpleNamespace(
        registry=SimpleNamespace(
            list_peers=lambda include_stale=False: list(peers),
            get_peer=lambda peer_id: next((peer for peer in peers if peer.peer_id == peer_id), None),
        )
    )
    fake_runtime = SimpleNamespace(
        settings=SimpleNamespace(rendezvous_namespace="test-ns", dev_service_peer_count=2),
        host=MagicMock(),
    )
    fake_runtime.host.get_id.return_value = "12D3KooWCoordinator"

    bridge = QuantumExecutionBridge(
        discovery_service=fake_discovery_service,
        libp2p_runtime=fake_runtime,
    )
    plan = bridge.compile_plan(
        "\n".join(
            [
                "OPENQASM 2.0;",
                'include "qelib1.inc";',
                "qreg q[3];",
                "creg c[3];",
                "h q[0];",
                "h q[1];",
                "cz q[0],q[1];",
                "h q[1];",
                "cz q[0],q[2];",
            ]
        )
    )

    assert len(plan.stages) == 3
    overlapping_stage = plan.stages[2]
    assert len(overlapping_stage.block_ids) == 1
    block = plan.blocks[overlapping_stage.block_ids[0]]
    assert block.fragment_ids == ("frag-0004", "frag-0005")
    assert block.input_component_qubits == ((0, 1), (2,))
    assert block.state_qubits == (0, 1, 2)


async def test_quantum_bridge_executes_parallel_blocks_with_local_component_state() -> None:
    now = datetime.now(timezone.utc)
    peers = [
        PeerRegistryEntry(
            peer_id="12D3KooWPeerA",
            trust_tier="platform_managed",
            health_status="healthy",
            network_addresses=("/ip4/127.0.0.1/tcp/4101",),
            supported_protocols=(),
            service_ids=("hadamard", "cz", "measurement_feedforward", "subcircuit_bundle"),
            last_seen_at=now,
        ),
        PeerRegistryEntry(
            peer_id="12D3KooWPeerB",
            trust_tier="platform_managed",
            health_status="healthy",
            network_addresses=("/ip4/127.0.0.1/tcp/4102",),
            supported_protocols=(),
            service_ids=("hadamard", "cz", "measurement_feedforward", "subcircuit_bundle"),
            last_seen_at=now,
        ),
    ]
    workers = {
        peer.peer_id: PeerFragmentWorker(peer_id=peer.peer_id, max_concurrent_slots=4)
        for peer in peers
    }
    fake_discovery_service = _FakeDiscoveryService(peers=peers, workers=workers)
    fake_runtime = SimpleNamespace(
        settings=SimpleNamespace(rendezvous_namespace="test-ns", dev_service_peer_count=2),
        host=MagicMock(),
    )
    fake_runtime.host.get_id.return_value = "12D3KooWCoordinator"

    bridge = QuantumExecutionBridge(
        discovery_service=fake_discovery_service,
        libp2p_runtime=fake_runtime,
    )
    plan = bridge.compile_plan(
        "\n".join(
            [
                "OPENQASM 2.0;",
                'include "qelib1.inc";',
                "qreg q[4];",
                "creg c[4];",
                "h q[0];",
                "h q[2];",
                "cz q[0],q[1];",
                "cz q[2],q[3];",
            ]
        )
    )

    executions = [
        execution
        async for execution in bridge.iter_fragment_executions(
            workflow_run_id="job-12345678",
            plan=plan,
        )
    ]

    assert len(executions) == 4
    stage_zero = [execution for execution in executions if execution.stage_index == 0]
    stage_one = [execution for execution in executions if execution.stage_index == 1]
    assert len(stage_zero) == 2
    assert len(stage_one) == 2
    assert {tuple(execution.output.component_qubits) for execution in stage_zero} == {(0,), (2,)}
    assert {tuple(execution.output.component_qubits) for execution in stage_one} == {(0, 1), (2, 3)}
    assert all(execution.output.state.num_qubits == len(execution.output.component_qubits) for execution in executions)


async def test_quantum_bridge_preserves_validation_fidelity_for_overlapping_component_stage() -> None:
    now = datetime.now(timezone.utc)
    peers = [
        PeerRegistryEntry(
            peer_id="12D3KooWPeerA",
            trust_tier="platform_managed",
            health_status="healthy",
            network_addresses=("/ip4/127.0.0.1/tcp/4101",),
            supported_protocols=(),
            service_ids=("hadamard", "cz", "measurement_feedforward", "subcircuit_bundle"),
            last_seen_at=now,
        ),
        PeerRegistryEntry(
            peer_id="12D3KooWPeerB",
            trust_tier="platform_managed",
            health_status="healthy",
            network_addresses=("/ip4/127.0.0.1/tcp/4102",),
            supported_protocols=(),
            service_ids=("hadamard", "cz", "measurement_feedforward", "subcircuit_bundle"),
            last_seen_at=now,
        ),
        PeerRegistryEntry(
            peer_id="12D3KooWPeerC",
            trust_tier="platform_managed",
            health_status="healthy",
            network_addresses=("/ip4/127.0.0.1/tcp/4103",),
            supported_protocols=(),
            service_ids=("hadamard", "cz", "measurement_feedforward", "subcircuit_bundle"),
            last_seen_at=now,
        ),
    ]
    workers = {
        peer.peer_id: PeerFragmentWorker(peer_id=peer.peer_id, max_concurrent_slots=4)
        for peer in peers
    }
    fake_discovery_service = _FakeDiscoveryService(peers=peers, workers=workers)
    fake_runtime = SimpleNamespace(
        settings=SimpleNamespace(rendezvous_namespace="test-ns", dev_service_peer_count=3),
        host=MagicMock(),
    )
    fake_runtime.host.get_id.return_value = "12D3KooWCoordinator"

    bridge = QuantumExecutionBridge(
        discovery_service=fake_discovery_service,
        libp2p_runtime=fake_runtime,
    )
    plan = bridge.compile_plan(
        "\n".join(
            [
                "OPENQASM 2.0;",
                'include "qelib1.inc";',
                "qreg q[3];",
                "creg c[3];",
                "h q[0];",
                "h q[1];",
                "cz q[0],q[1];",
                "h q[1];",
                "cz q[0],q[2];",
                "measure q[0] -> c[0];",
                "measure q[1] -> c[1];",
                "measure q[2] -> c[2];",
            ]
        )
    )

    executions = [
        execution
        async for execution in bridge.iter_fragment_executions(
            workflow_run_id="job-12345678",
            plan=plan,
        )
    ]

    final_state = executions[-1].state
    quantum_result = bridge.build_quantum_result(
        plan=plan,
        fragment_results=tuple(execution.fragment_result for execution in executions),
        final_state=final_state,
    )
    # Import the function directly for analytic comparison
    from quantum_backend_v2.runtime.qiskit_results import build_quantum_result
    analytic_result = build_quantum_result(
        plan,
        fragment_results=tuple(execution.fragment_result for execution in executions),
    )

    assert quantum_result["counts"] == analytic_result["counts"]
    for basis_state, probability in analytic_result["probabilities"].items():
        if probability <= 0.0:
            continue
        assert quantum_result["probabilities"][basis_state] == pytest.approx(probability)
    assert quantum_result["distributed_execution"]["validation_statevector_fidelity"] == pytest.approx(
        1.0
    )


def test_quantum_bridge_spreads_assignments_across_peers() -> None:
    now = datetime.now(timezone.utc)
    peers = [
        PeerRegistryEntry(
            peer_id="12D3KooWPeerA",
            trust_tier="platform_managed",
            health_status="healthy",
            network_addresses=("/ip4/127.0.0.1/tcp/4101",),
            supported_protocols=(),
            service_ids=("hadamard", "cz", "measurement_feedforward"),
            last_seen_at=now,
        ),
        PeerRegistryEntry(
            peer_id="12D3KooWPeerB",
            trust_tier="platform_managed",
            health_status="healthy",
            network_addresses=("/ip4/127.0.0.1/tcp/4102",),
            supported_protocols=(),
            service_ids=("hadamard", "cz", "measurement_feedforward"),
            last_seen_at=now,
        ),
        PeerRegistryEntry(
            peer_id="12D3KooWPeerC",
            trust_tier="platform_managed",
            health_status="healthy",
            network_addresses=("/ip4/127.0.0.1/tcp/4103",),
            supported_protocols=(),
            service_ids=("hadamard", "cz", "measurement_feedforward"),
            last_seen_at=now,
        ),
    ]

    fake_registry = SimpleNamespace(
        list_peers=lambda include_stale=False: list(peers),
        get_peer=lambda peer_id: next((peer for peer in peers if peer.peer_id == peer_id), None),
    )
    fake_discovery_service = SimpleNamespace(registry=fake_registry)
    fake_runtime = SimpleNamespace(
        settings=SimpleNamespace(rendezvous_namespace="test-ns", dev_service_peer_count=3),
        host=MagicMock(),
    )
    fake_runtime.host.get_id.return_value = "12D3KooWCoordinator"

    bridge = QuantumExecutionBridge(
        discovery_service=fake_discovery_service,
        libp2p_runtime=fake_runtime,
    )
    plan = bridge.compile_plan(
        "\n".join(
            [
                "OPENQASM 2.0;",
                'include "qelib1.inc";',
                "qreg q[2];",
                "creg c[2];",
                "h q[0];",
                "cz q[0],q[1];",
                "h q[1];",
                "measure q[0] -> c[0];",
            ]
        )
    )

    assigned_nodes = {
        assignment.primary_node_id for assignment in plan.assignments.values()
    }
    assert len(assigned_nodes) >= 2


class _DeadFirstPeerDiscoveryService(_FakeDiscoveryService):
    """The first peer the bridge contacts is unreachable (e.g. a laptop that went to sleep)."""

    def __init__(self, *, fail_all: bool = False, **kwargs) -> None:
        super().__init__(**kwargs)
        self.dead_peer_id: str | None = None
        self._fail_all = fail_all

    async def request_peer_rpc(self, *, peer_id: str, **kwargs) -> bytes:
        if self.dead_peer_id is None:
            self.dead_peer_id = peer_id
        if self._fail_all or peer_id == self.dead_peer_id:
            raise TimeoutError("libp2p stream request timed out")
        return await super().request_peer_rpc(peer_id=peer_id, **kwargs)


def _two_peer_bridge(*, fail_all: bool = False, discovery_cls=None, **bridge_kwargs):
    now = datetime.now(timezone.utc)
    peers = [
        PeerRegistryEntry(
            peer_id=f"12D3KooWPeer{name}",
            trust_tier="platform_managed",
            health_status="healthy",
            service_ids=("hadamard", "subcircuit_bundle"),
            last_seen_at=now,
        )
        for name in ("A", "B")
    ]
    workers = {p.peer_id: PeerFragmentWorker(peer_id=p.peer_id, max_concurrent_slots=4) for p in peers}
    if discovery_cls is None:
        discovery = _DeadFirstPeerDiscoveryService(peers=peers, workers=workers, fail_all=fail_all)
    else:
        discovery = discovery_cls(peers=peers, workers=workers)
    runtime = SimpleNamespace(
        settings=SimpleNamespace(rendezvous_namespace="test-ns", dev_service_peer_count=2),
        host=MagicMock(),
    )
    runtime.host.get_id.return_value = "12D3KooWCoordinator"
    bridge = QuantumExecutionBridge(discovery_service=discovery, libp2p_runtime=runtime, **bridge_kwargs)
    plan = bridge.compile_plan('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\ncreg c[1];\nh q[0];')
    return bridge, discovery, plan


async def test_quantum_bridge_falls_back_to_next_peer_when_a_peer_is_unreachable() -> None:
    bridge, discovery, plan = _two_peer_bridge()

    executions = [
        execution
        async for execution in bridge.iter_fragment_executions(workflow_run_id="job-12345678", plan=plan)
    ]

    result = executions[0].fragment_result
    assert discovery.dead_peer_id is not None
    assert result.node_id != discovery.dead_peer_id
    assert result.attempts == 2


async def test_quantum_bridge_raises_when_every_peer_is_unreachable() -> None:
    bridge, _, plan = _two_peer_bridge(fail_all=True)

    with pytest.raises(RuntimeError, match="failed across all assigned peers"):
        _ = [
            execution
            async for execution in bridge.iter_fragment_executions(workflow_run_id="job-12345678", plan=plan)
        ]


class _RejectFirstPeerDiscoveryService(_FakeDiscoveryService):
    """The first peer contacted answers 'capacity exhausted' to the reservation request."""

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self.rejecting_peer_id: str | None = None

    async def request_peer_rpc(self, *, peer_id: str, protocol_id: str, **kwargs) -> bytes:
        if self.rejecting_peer_id is None:
            self.rejecting_peer_id = peer_id
        if peer_id == self.rejecting_peer_id and protocol_id == self._protocol_ids.reservation_prepare:
            request = ReservationPrepareRequest.model_validate_json(kwargs["payload"])
            return ReservationPrepareResponse(
                reservation_id=request.reservation_id,
                accepting_peer_id=peer_id,
                transition=ReservationTransition.REJECTED,
                reason="peer capacity exhausted",
            ).model_dump_json().encode("utf-8")
        return await super().request_peer_rpc(peer_id=peer_id, protocol_id=protocol_id, **kwargs)


async def test_quantum_bridge_falls_back_when_a_peer_reports_capacity_exhausted() -> None:
    # autospec checks call signatures, which is what caught reject() being called with a bad kwarg.
    reservations = create_autospec(ReservationService, instance=True)
    bridge, discovery, plan = _two_peer_bridge(
        discovery_cls=_RejectFirstPeerDiscoveryService, reservation_service=reservations
    )

    executions = [
        execution
        async for execution in bridge.iter_fragment_executions(workflow_run_id="job-12345678", plan=plan)
    ]

    assert executions[0].fragment_result.node_id != discovery.rejecting_peer_id
    reservations.reject.assert_awaited_once()


async def test_quantum_bridge_closes_ledger_entries_of_an_unreachable_peer_attempt() -> None:
    reservations = create_autospec(ReservationService, instance=True)
    executions_ledger = create_autospec(ExecutionService, instance=True)
    bridge, _, plan = _two_peer_bridge(
        reservation_service=reservations, execution_service=executions_ledger
    )

    _ = [
        execution
        async for execution in bridge.iter_fragment_executions(workflow_run_id="job-12345678", plan=plan)
    ]

    reservations.cancel.assert_awaited_once()
    executions_ledger.record_failed.assert_awaited_once()
