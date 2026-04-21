"""Unit tests for distributed fragment execution helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from quantum_backend_v2.application.distributed_statevector import (
    apply_fragment_to_state,
    make_initial_state_handoff,
    summarize_state_handoff,
)
from quantum_backend_v2.application.quantum_bridge import QuantumExecutionBridge
from quantum_backend_v2.discovery.registry import PeerRegistryEntry
from quantum_backend_v2.libp2p.fragment_worker import PeerFragmentWorker
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
