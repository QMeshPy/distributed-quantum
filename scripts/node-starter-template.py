#!/usr/bin/env python3
"""QB2 Node - quantum-computing network external node.
Run: python node-starter-template.py --coordinator <MULTIADDR> --label my-node
"""

# stdlib
import asyncio
import argparse
import json
import logging
import os
import signal
import hashlib
import sys
from datetime import datetime, timedelta, timezone
from typing import Any

# pip install "git+https://github.com/libp2p/py-libp2p.git@main" qiskit qiskit-aer pydantic
# Imports are deferred to _check_deps() so --help works without dependencies installed.
new_host = create_new_key_pair = KeyType = info_from_p2p_addr = TProtocol = None
BasicHost = INetStream = GossipSub = Pubsub = None
QuantumCircuit = Statevector = AerSimulator = QFTGate = UGate = None


def _check_deps() -> None:
    global new_host, create_new_key_pair, KeyType, info_from_p2p_addr, TProtocol
    global BasicHost, INetStream, GossipSub, Pubsub
    global QuantumCircuit, Statevector, AerSimulator, QFTGate, UGate
    try:
        from libp2p import new_host as _new_host
        from libp2p import create_new_ed25519_key_pair as _cnkp
        from libp2p.crypto.keys import KeyType as _KT
        from libp2p.peer.peerinfo import info_from_p2p_addr as _ifpa
        from libp2p.typing import TProtocol as _TP
        from libp2p.host.basic_host import BasicHost as _BH
        from libp2p.network.stream.net_stream_interface import INetStream as _INS
        from libp2p.pubsub.gossipsub import GossipSub as _GS
        from libp2p.pubsub.pubsub import Pubsub as _PB
        new_host, create_new_key_pair, KeyType = _new_host, _cnkp, _KT
        info_from_p2p_addr, TProtocol = _ifpa, _TP
        BasicHost, INetStream, GossipSub, Pubsub = _BH, _INS, _GS, _PB
    except ImportError as e:
        sys.exit(f"libp2p not installed: {e}\nRun: pip install "git+https://github.com/libp2p/py-libp2p.git@main"")
    try:
        from qiskit import QuantumCircuit as _QC
        from qiskit.quantum_info import Statevector as _SV
        from qiskit_aer import AerSimulator as _AS
        from qiskit.circuit.library import QFTGate as _QFT
        from qiskit.circuit.library import UGate as _UG
        QuantumCircuit, Statevector, AerSimulator = _QC, _SV, _AS
        QFTGate, UGate = _QFT, _UG
    except ImportError as e:
        sys.exit(f"Qiskit not installed: {e}\nRun: pip install qiskit qiskit-aer")

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

logger = logging.getLogger("qb2.node")


# ---------------------------------------------------------------------------
# Wire schemas — mirrored from coordinator
# ---------------------------------------------------------------------------

def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ServiceAdvertisementSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    service_id: str = Field(min_length=2)
    version: str = Field(min_length=3)
    quantum_capability: str = Field(min_length=2)
    benchmark_mode: str = Field(min_length=3)


class PeerAdvertisement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    peer_id: str = Field(min_length=3)
    trust_tier: str = Field(min_length=3)
    network_addresses: tuple[str, ...] = Field(default_factory=tuple)
    supported_protocols: tuple[str, ...] = Field(default_factory=tuple)
    service_summaries: tuple[ServiceAdvertisementSummary, ...] = Field(default_factory=tuple)
    peer_log_position: int = Field(default=0, ge=0)
    emitted_at: datetime = Field(default_factory=_utc_now)

    @field_validator("emitted_at")
    @classmethod
    def _ensure_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("emitted_at must be timezone-aware")
        return value.astimezone(timezone.utc)


class PeerHeartbeat(BaseModel):
    model_config = ConfigDict(extra="forbid")
    peer_id: str = Field(min_length=3)
    health_status: str = Field(min_length=2)
    active_reservations: int = Field(default=0, ge=0)
    active_executions: int = Field(default=0, ge=0)
    peer_log_position: int = Field(default=0, ge=0)
    emitted_at: datetime = Field(default_factory=_utc_now)

    @field_validator("emitted_at")
    @classmethod
    def _ensure_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("emitted_at must be timezone-aware")
        return value.astimezone(timezone.utc)


class ReservationTransition(str):
    REQUESTED = "requested"
    ACCEPTED = "accepted"
    COMMITTED = "committed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    REJECTED = "rejected"


class ReservationPrepareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    reservation_id: str = Field(min_length=8)
    workflow_run_id: str = Field(min_length=8)
    fragment_id: str = Field(min_length=3)
    requesting_peer_id: str = Field(min_length=3)
    service_id: str = Field(min_length=2)
    estimated_qubits: int = Field(ge=1)
    estimated_depth: int = Field(ge=1)
    priority: int = Field(default=0, ge=0, le=100)
    ttl_seconds: int = Field(default=60, ge=5)
    idempotency_key: str = Field(min_length=8)
    sent_at: datetime = Field(default_factory=_utc_now)


class ReservationPrepareResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    reservation_id: str = Field(min_length=8)
    accepting_peer_id: str = Field(min_length=3)
    transition: str
    reason: str | None = Field(default=None, max_length=300)
    replied_at: datetime = Field(default_factory=_utc_now)


class ReservationCommitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    reservation_id: str = Field(min_length=8)
    workflow_run_id: str = Field(min_length=8)
    fragment_id: str = Field(min_length=3)
    sent_at: datetime = Field(default_factory=_utc_now)


class ReservationCommitResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    reservation_id: str = Field(min_length=8)
    transition: str
    replied_at: datetime = Field(default_factory=_utc_now)


class ReservationCancelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    reservation_id: str = Field(min_length=8)
    reason: str | None = Field(default=None, max_length=300)
    sent_at: datetime = Field(default_factory=_utc_now)


class ReservationCancelResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    reservation_id: str = Field(min_length=8)
    transition: str
    replied_at: datetime = Field(default_factory=_utc_now)


class DistributedStateHandoff(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    num_qubits: int = Field(ge=1)
    qubit_ids: tuple[int, ...] | None = None
    amplitudes: tuple[str, ...] | None = None
    measured_qubits: tuple[int, ...] = Field(default_factory=tuple)
    previous_peer_id: str | None = Field(default=None, min_length=3)

    @model_validator(mode="after")
    def _validate_qubit_ids(self) -> "DistributedStateHandoff":
        if self.qubit_ids is None:
            return self
        if len(self.qubit_ids) != self.num_qubits:
            raise ValueError("qubit_ids length must match num_qubits")
        if len(set(self.qubit_ids)) != len(self.qubit_ids):
            raise ValueError("qubit_ids must be unique")
        return self


class FragmentDescriptor(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    fragment_id: str = Field(min_length=3)
    service_id: str = Field(min_length=2)
    qubits: tuple[int, ...] = Field(default_factory=tuple)
    operation_ids: tuple[str, ...] = Field(default_factory=tuple)
    dependencies: tuple[str, ...] = Field(default_factory=tuple)
    raw_text: str = ""


class FragmentDispatchInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    plan_id: str = Field(min_length=8)
    block_id: str | None = Field(default=None, min_length=3)
    fragment: FragmentDescriptor | None = None
    fragments: tuple[FragmentDescriptor, ...] = Field(default_factory=tuple)
    state: DistributedStateHandoff

    @model_validator(mode="after")
    def _validate_fragment_bundle(self) -> "FragmentDispatchInput":
        bundle_size = len(self.fragments) + (1 if self.fragment is not None else 0)
        if bundle_size <= 0:
            raise ValueError("dispatch input requires at least one fragment")
        return self

    def fragment_bundle(self) -> tuple[FragmentDescriptor, ...]:
        if self.fragments:
            return self.fragments
        if self.fragment is not None:
            return (self.fragment,)
        return ()


class FragmentDispatchOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    state: DistributedStateHandoff
    block_id: str | None = Field(default=None, min_length=3)
    fragment_ids: tuple[str, ...] = Field(default_factory=tuple)
    component_qubits: tuple[int, ...] = Field(default_factory=tuple)
    gate_count: int = Field(default=0, ge=0)
    circuit_depth: int = Field(default=0, ge=0)
    state_transfer_bytes: int = Field(default=0, ge=0)


class ExecutionTransition(str):
    DISPATCHED = "dispatched"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class FragmentDispatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    execution_id: str = Field(min_length=8)
    reservation_id: str = Field(min_length=8)
    workflow_run_id: str = Field(min_length=8)
    fragment_id: str = Field(min_length=3)
    service_id: str = Field(min_length=2)
    input_payload: dict[str, Any] = Field(default_factory=dict)
    max_retries: int = Field(default=2, ge=0, le=10)
    idempotency_key: str = Field(min_length=8)
    dispatched_at: datetime = Field(default_factory=_utc_now)


class ExecutionResultPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    execution_id: str = Field(min_length=8)
    fragment_id: str = Field(min_length=3)
    executing_peer_id: str = Field(min_length=3)
    transition: str
    output_payload: dict[str, Any] = Field(default_factory=dict)
    latency_ms: float | None = Field(default=None, ge=0.0)
    fidelity_score: float | None = Field(default=None, ge=0.0, le=1.0)
    error_detail: str | None = Field(default=None, max_length=600)
    artifact_refs: list[str] = Field(default_factory=list)
    completed_at: datetime = Field(default_factory=_utc_now)



# ---------------------------------------------------------------------------
# Quantum execution logic — mirrored from application/distributed_statevector
# ---------------------------------------------------------------------------

def _statevector_from_handoff(state: DistributedStateHandoff) -> Statevector:
    amplitudes = state.amplitudes
    if not amplitudes:
        vector = [0j] * (2 ** state.num_qubits)
        vector[0] = 1 + 0j
        return Statevector(vector)
    return Statevector([complex(value) for value in amplitudes])


def _serialize_statevector(sv: Statevector) -> tuple[str, ...]:
    return tuple(str(complex(v)) for v in sv.data)


def _handoff_qubit_ids(state: DistributedStateHandoff) -> tuple[int, ...]:
    if state.qubit_ids is not None:
        return state.qubit_ids
    return tuple(range(state.num_qubits))


def _apply_raw_operation(
    circuit: QuantumCircuit,
    *,
    raw_text: str,
    qubits: tuple[int, ...],
    global_qubits: tuple[int, ...],
    measured_qubits: list[int],
) -> bool:
    t = raw_text.strip().upper()
    if t == "H" and qubits:
        for q in qubits:
            circuit.h(q)
        return True
    if t == "X" and qubits:
        for q in qubits:
            circuit.x(q)
        return True
    if t == "CNOT" and len(qubits) >= 2:
        circuit.cx(qubits[0], qubits[1])
        return True
    if t == "CX" and len(qubits) >= 2:
        circuit.cx(qubits[0], qubits[1])
        return True
    if t == "CZ" and len(qubits) >= 2:
        circuit.cz(qubits[0], qubits[1])
        return True
    if t == "MEASURE" and qubits:
        for gq in global_qubits:
            if gq not in measured_qubits:
                measured_qubits.append(gq)
        return True
    return False


def _apply_fragment_operation(
    circuit: QuantumCircuit,
    *,
    fragment: FragmentDescriptor,
    measured_qubits: list[int],
    qubits: tuple[int, ...] | None = None,
    global_qubits: tuple[int, ...] | None = None,
) -> None:
    local_qubits = qubits or fragment.qubits
    measurement_qubits = global_qubits or fragment.qubits

    if fragment.raw_text and _apply_raw_operation(
        circuit,
        raw_text=fragment.raw_text,
        qubits=local_qubits,
        global_qubits=measurement_qubits,
        measured_qubits=measured_qubits,
    ):
        return

    service_id = fragment.service_id

    if service_id == "hadamard":
        for qubit in local_qubits:
            circuit.h(qubit)
        return

    if service_id == "bell_pair" and len(local_qubits) >= 2:
        circuit.h(local_qubits[0])
        circuit.cx(local_qubits[0], local_qubits[1])
        return

    if service_id == "cnot" and len(local_qubits) >= 2:
        circuit.cx(local_qubits[0], local_qubits[1])
        return

    if service_id == "cz" and len(local_qubits) >= 2:
        circuit.cz(local_qubits[0], local_qubits[1])
        return

    if service_id == "controlled_unitary" and len(local_qubits) >= 2:
        control = local_qubits[0]
        for target in local_qubits[1:]:
            if target != control:
                circuit.cx(control, target)
        return

    if service_id == "qft" and local_qubits:
        try:
            circuit.compose(QFTGate(len(local_qubits)), qubits=list(local_qubits), inplace=True)
        except Exception:
            pass
        return

    if service_id == "teleportation" and len(local_qubits) >= 2:
        circuit.swap(local_qubits[0], local_qubits[1])
        return

    if service_id == "measurement_feedforward":
        for qubit in measurement_qubits:
            if qubit not in measured_qubits:
                measured_qubits.append(qubit)
        return

    if service_id in {"syndrome_extraction", "distillation"}:
        return

    if service_id == "programmable_gate" and local_qubits:
        circuit.append(UGate(0.12, 0.34, 0.56), [local_qubits[0]])
        return


def apply_fragments_to_state(
    *,
    fragments: tuple[FragmentDescriptor, ...] | list[FragmentDescriptor],
    state: DistributedStateHandoff,
    previous_peer_id: str,
    block_id: str | None = None,
) -> FragmentDispatchOutput:
    statevector = _statevector_from_handoff(state)
    measured_qubits = list(state.measured_qubits)
    qubit_ids = _handoff_qubit_ids(state)
    global_to_local = {qubit_id: index for index, qubit_id in enumerate(qubit_ids)}
    circuit = QuantumCircuit(state.num_qubits)
    for fragment in fragments:
        _apply_fragment_operation(
            circuit,
            fragment=fragment,
            measured_qubits=measured_qubits,
            qubits=tuple(global_to_local[qubit_id] for qubit_id in fragment.qubits),
            global_qubits=fragment.qubits,
        )
    next_statevector = statevector.evolve(circuit) if circuit.data else statevector
    next_state = DistributedStateHandoff(
        num_qubits=state.num_qubits,
        qubit_ids=qubit_ids,
        amplitudes=_serialize_statevector(next_statevector),
        measured_qubits=tuple(measured_qubits),
        previous_peer_id=previous_peer_id,
    )
    return FragmentDispatchOutput(
        state=next_state,
        block_id=block_id,
        fragment_ids=tuple(fragment.fragment_id for fragment in fragments),
        component_qubits=qubit_ids,
        gate_count=len(circuit.data),
        circuit_depth=circuit.depth() or 0,
        state_transfer_bytes=len(next_state.model_dump_json().encode("utf-8")),
    )



# ---------------------------------------------------------------------------
# Protocol ID builder
# ---------------------------------------------------------------------------

def build_execution_protocol_ids(namespace: str) -> dict[str, str]:
    base = f"/qb2/{namespace}"
    return {
        "reservation_prepare": f"{base}/reservation/prepare/1.0.0",
        "reservation_commit": f"{base}/reservation/commit/1.0.0",
        "reservation_cancel": f"{base}/reservation/cancel/1.0.0",
        "fragment_dispatch": f"{base}/execution/fragment-dispatch/1.0.0",
    }


# ---------------------------------------------------------------------------
# In-memory reservation/execution worker
# ---------------------------------------------------------------------------

from dataclasses import dataclass
from time import perf_counter


@dataclass
class _PreparedReservation:
    reservation_id: str
    workflow_run_id: str
    fragment_id: str
    service_id: str
    requesting_peer_id: str
    expires_at: datetime
    committed: bool = False


class PeerFragmentWorker:
    """In-memory worker that handles reservation and execution RPC."""

    def __init__(self, *, peer_id: str, max_concurrent_slots: int = 4) -> None:
        self._peer_id = peer_id
        self._max_concurrent_slots = max_concurrent_slots
        self._reservations: dict[str, _PreparedReservation] = {}
        self._active_executions: set[str] = set()
        self._execution_results: dict[str, ExecutionResultPayload] = {}

    def heartbeat_snapshot(self) -> tuple[int, int]:
        self._purge_expired()
        return len(self._reservations), len(self._active_executions)

    async def handle_prepare(self, payload: bytes) -> bytes:
        request = ReservationPrepareRequest.model_validate_json(payload)
        self._purge_expired()
        existing = self._reservations.get(request.reservation_id)
        if existing is not None:
            transition = "committed" if existing.committed else "accepted"
            return ReservationPrepareResponse(
                reservation_id=request.reservation_id,
                accepting_peer_id=self._peer_id,
                transition=transition,
            ).model_dump_json().encode("utf-8")

        active_slots = len(self._reservations) + len(self._active_executions)
        if active_slots >= self._max_concurrent_slots:
            return ReservationPrepareResponse(
                reservation_id=request.reservation_id,
                accepting_peer_id=self._peer_id,
                transition="rejected",
                reason="peer capacity exhausted",
            ).model_dump_json().encode("utf-8")

        self._reservations[request.reservation_id] = _PreparedReservation(
            reservation_id=request.reservation_id,
            workflow_run_id=request.workflow_run_id,
            fragment_id=request.fragment_id,
            service_id=request.service_id,
            requesting_peer_id=request.requesting_peer_id,
            expires_at=_utc_now() + timedelta(seconds=request.ttl_seconds),
        )
        return ReservationPrepareResponse(
            reservation_id=request.reservation_id,
            accepting_peer_id=self._peer_id,
            transition="accepted",
        ).model_dump_json().encode("utf-8")

    async def handle_commit(self, payload: bytes) -> bytes:
        request = ReservationCommitRequest.model_validate_json(payload)
        self._purge_expired()
        reservation = self._reservations.get(request.reservation_id)
        if reservation is None:
            return ReservationCommitResponse(
                reservation_id=request.reservation_id,
                transition="rejected",
            ).model_dump_json().encode("utf-8")
        reservation.committed = True
        return ReservationCommitResponse(
            reservation_id=request.reservation_id,
            transition="committed",
        ).model_dump_json().encode("utf-8")

    async def handle_cancel(self, payload: bytes) -> bytes:
        request = ReservationCancelRequest.model_validate_json(payload)
        self._reservations.pop(request.reservation_id, None)
        return ReservationCancelResponse(
            reservation_id=request.reservation_id,
            transition="cancelled",
        ).model_dump_json().encode("utf-8")

    async def handle_dispatch(self, payload: bytes) -> bytes:
        request = FragmentDispatchRequest.model_validate_json(payload)
        existing = self._execution_results.get(request.execution_id)
        if existing is not None:
            return existing.model_dump_json().encode("utf-8")

        reservation = self._reservations.get(request.reservation_id)
        if reservation is None or not reservation.committed:
            result = ExecutionResultPayload(
                execution_id=request.execution_id,
                fragment_id=request.fragment_id,
                executing_peer_id=self._peer_id,
                transition="failed",
                error_detail="reservation not committed on target peer",
            )
            self._execution_results[request.execution_id] = result
            return result.model_dump_json().encode("utf-8")

        self._active_executions.add(request.execution_id)
        self._reservations.pop(request.reservation_id, None)
        started_at = perf_counter()
        try:
            dispatch_input = FragmentDispatchInput.model_validate(request.input_payload)
            fragments = dispatch_input.fragment_bundle()
            dispatch_output = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: apply_fragments_to_state(
                    fragments=fragments,
                    state=dispatch_input.state,
                    previous_peer_id=self._peer_id,
                    block_id=dispatch_input.block_id,
                ),
            )
            result = ExecutionResultPayload(
                execution_id=request.execution_id,
                fragment_id=request.fragment_id,
                executing_peer_id=self._peer_id,
                transition="completed",
                output_payload=dispatch_output.model_dump(mode="json"),
                latency_ms=(perf_counter() - started_at) * 1000.0,
            )
        except Exception as exc:
            logger.exception("Fragment dispatch failed: %s", exc)
            result = ExecutionResultPayload(
                execution_id=request.execution_id,
                fragment_id=request.fragment_id,
                executing_peer_id=self._peer_id,
                transition="failed",
                error_detail=str(exc),
                latency_ms=(perf_counter() - started_at) * 1000.0,
            )
        finally:
            self._active_executions.discard(request.execution_id)

        self._execution_results[request.execution_id] = result
        return result.model_dump_json().encode("utf-8")

    def _purge_expired(self) -> None:
        now = _utc_now()
        expired = [rid for rid, r in self._reservations.items() if r.expires_at <= now]
        for rid in expired:
            self._reservations.pop(rid, None)



# ---------------------------------------------------------------------------
# QuantumNode — wraps libp2p host + GossipSub + stream handlers
# ---------------------------------------------------------------------------

class QuantumNode:
    """External quantum node that connects to the QB2 coordinator network."""

    def __init__(self, args: Any) -> None:
        self.args = args
        self.peer_id: str = ""
        self.host: Any = None
        self.pubsub: Any = None
        self.worker: PeerFragmentWorker | None = None
        self.protocol_ids: dict[str, str] = build_execution_protocol_ids(args.namespace)
        self._advertisement_topic = f"{args.namespace}.peer-advertisement.v1"
        self._heartbeat_topic = f"{args.namespace}.peer-heartbeat.v1"
        self._shutdown_event = asyncio.Event()

    async def start(self) -> None:
        # Deterministic Ed25519 key from label
        seed = hashlib.sha256(self.args.label.encode()).digest()
        key_pair = create_new_key_pair(seed)

        listen_addr = f"/ip4/0.0.0.0/tcp/{self.args.port}"

        self.host = new_host(key_pair=key_pair)
        self.peer_id = str(self.host.get_id())

        self.worker = PeerFragmentWorker(
            peer_id=self.peer_id,
            max_concurrent_slots=4,
        )

        # Register stream handlers
        self.host.set_stream_handler(
            TProtocol(self.protocol_ids["reservation_prepare"]),
            self._make_handler(self.worker.handle_prepare),
        )
        self.host.set_stream_handler(
            TProtocol(self.protocol_ids["reservation_commit"]),
            self._make_handler(self.worker.handle_commit),
        )
        self.host.set_stream_handler(
            TProtocol(self.protocol_ids["reservation_cancel"]),
            self._make_handler(self.worker.handle_cancel),
        )
        self.host.set_stream_handler(
            TProtocol(self.protocol_ids["fragment_dispatch"]),
            self._make_handler(self.worker.handle_dispatch),
        )

        await self.host.get_network().listen(listen_addr)

        # GossipSub setup
        gossipsub = GossipSub(
            protocols=["/meshsub/1.1.0", "/meshsub/1.0.0", "/floodsub/1.0.0"],
            degree=6,
            degree_low=4,
            degree_high=12,
            time_to_live=30,
        )
        self.pubsub = Pubsub(self.host, gossipsub, self.peer_id)

        await self.pubsub.subscribe(self._advertisement_topic)
        await self.pubsub.subscribe(self._heartbeat_topic)

        # Connect to coordinator
        await self._connect_coordinator()

        # Print startup banner
        listen_multiaddr = f"/ip4/0.0.0.0/tcp/{self.args.port}/p2p/{self.peer_id}"
        advertise_addr = self.args.advertise_addr or listen_multiaddr
        services = [s.strip() for s in self.args.services.split(",") if s.strip()]
        print("" * 60)
        print(f"  QB2 Node starting up")
        print(f"  Label     : {self.args.label}")
        print(f"  Peer ID   : {self.peer_id}")
        print(f"  Listen    : {listen_multiaddr}")
        print(f"  Advertise : {advertise_addr}")
        print(f"  Coordinator: {self.args.coordinator}")
        print(f"  Services  : {services}")
        print(f"  Max qubits: {self.args.max_qubits}")
        print("" * 60)

        # Publish initial advertisement
        await self._publish_advertisement(services, advertise_addr)

        # Heartbeat loop
        asyncio.ensure_future(self._heartbeat_loop(services, advertise_addr))

    def _make_handler(self, handler_fn: Any):
        async def _handle_stream(stream: INetStream) -> None:
            try:
                data = await stream.read(65536)
                response = await handler_fn(data)
                await stream.write(response)
            except Exception as exc:
                logger.error("Stream handler error: %s", exc)
            finally:
                await stream.close()
        return _handle_stream

    async def _connect_coordinator(self) -> None:
        coordinator_addr = self.args.coordinator
        if not coordinator_addr:
            return
        try:
            peer_info = info_from_p2p_addr(coordinator_addr)
            await self.host.connect(peer_info)
            logger.info("Connected to coordinator %s", coordinator_addr)
        except Exception as exc:
            logger.warning("Could not connect to coordinator %s: %s", coordinator_addr, exc)

    async def _publish_advertisement(self, services: list[str], advertise_addr: str) -> None:
        summaries = tuple(
            ServiceAdvertisementSummary(
                service_id=svc,
                version="1.0.0",
                quantum_capability=svc,
                benchmark_mode="sim",
            )
            for svc in services
        )
        advert = PeerAdvertisement(
            peer_id=self.peer_id,
            trust_tier="external",
            network_addresses=(advertise_addr,),
            supported_protocols=tuple(self.protocol_ids.values()),
            service_summaries=summaries,
        )
        try:
            await self.pubsub.publish(
                self._advertisement_topic,
                advert.model_dump_json().encode("utf-8"),
            )
            logger.info("Published peer advertisement")
        except Exception as exc:
            logger.warning("Failed to publish advertisement: %s", exc)

    async def _heartbeat_loop(self, services: list[str], advertise_addr: str) -> None:
        while not self._shutdown_event.is_set():
            try:
                await asyncio.wait_for(
                    self._shutdown_event.wait(),
                    timeout=self.args.heartbeat_interval,
                )
            except asyncio.TimeoutError:
                pass
            if self._shutdown_event.is_set():
                break
            await self._send_heartbeat()

    async def _send_heartbeat(self) -> None:
        if self.worker is None:
            return
        active_reservations, active_executions = self.worker.heartbeat_snapshot()
        hb = PeerHeartbeat(
            peer_id=self.peer_id,
            health_status="healthy",
            active_reservations=active_reservations,
            active_executions=active_executions,
        )
        try:
            await self.pubsub.publish(
                self._heartbeat_topic,
                hb.model_dump_json().encode("utf-8"),
            )
            logger.debug("Published heartbeat (reservations=%d, executions=%d)",
                         active_reservations, active_executions)
        except Exception as exc:
            logger.warning("Failed to publish heartbeat: %s", exc)

    async def stop(self) -> None:
        self._shutdown_event.set()
        if self.host is not None:
            try:
                await self.host.close()
            except Exception:
                pass
        logger.info("Node shut down")



# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _parse_args() -> Any:
    parser = argparse.ArgumentParser(
        description="QB2 Node — quantum-computing network external node.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--coordinator",
        required=True,
        metavar="MULTIADDR",
        help="Coordinator multiaddr, e.g. /ip4/1.2.3.4/tcp/4011/p2p/12D3Koo...",
    )
    parser.add_argument(
        "--label",
        default=None,
        help="Human-readable node label (default: hostname)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=4020,
        help="TCP port for this node to listen on",
    )
    parser.add_argument(
        "--advertise-addr",
        default=None,
        dest="advertise_addr",
        help="Override the advertised multiaddr (optional)",
    )
    parser.add_argument(
        "--services",
        default="circuit_fragment",
        help="Comma-separated list of service names this node provides",
    )
    parser.add_argument(
        "--max-qubits",
        type=int,
        default=20,
        dest="max_qubits",
        help="Maximum number of qubits this node can handle",
    )
    parser.add_argument(
        "--namespace",
        default="qb2",
        help="Protocol namespace (must match coordinator)",
    )
    parser.add_argument(
        "--heartbeat-interval",
        type=int,
        default=30,
        dest="heartbeat_interval",
        help="Seconds between heartbeat publishes",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        dest="log_level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Log level",
    )
    args = parser.parse_args()
    if args.label is None:
        import socket
        args.label = socket.gethostname()
    return args


async def main() -> None:
    args = _parse_args()
    _check_deps()
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    node = QuantumNode(args)

    loop = asyncio.get_event_loop()

    def _handle_sigterm(*_: Any) -> None:
        logger.info("SIGTERM received, shutting down...")
        asyncio.ensure_future(node.stop())
        loop.stop()

    signal.signal(signal.SIGTERM, _handle_sigterm)

    try:
        await node.start()
        await node._shutdown_event.wait()
    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt — shutting down...")
    finally:
        await node.stop()


if __name__ == "__main__":
    asyncio.run(main())
