"""Spread independent compute tasks over the healthy peers, one task per peer at a time.

Peers pull work from a shared list, so a fast laptop simply takes more tasks. A peer that fails
(unreachable, missing a library, protocol unknown) is dropped for the rest of the call and its task
goes to another peer; whatever no peer could run is run on the coordinator.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from collections.abc import Callable, Coroutine, Hashable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from quantum_backend_v2.protocols.compute import ComputeTaskRequest, ComputeTaskResponse

if TYPE_CHECKING:
    from quantum_backend_v2.application.filecoin_tasks import CheckpointCallback
    from quantum_backend_v2.artifacts.filecoin import FilecoinReceipt, FilecoinStore

logger = logging.getLogger(__name__)

LOCAL = "local"

# (task index, state, peer ID, detail); states: queued, running, done, failed, superseded
TaskListener = Callable[[int, str, str | None, str | None], None]


@dataclass(frozen=True)
class TaskOutcome:
    output: dict[str, Any]
    executed_by: str  # a peer ID, or LOCAL
    attempts: int
    elapsed_seconds: float


class PeerTaskDispatcher:
    def __init__(
        self,
        *,
        discovery_service: Any | None,
        protocol_id: str | None = None,
        local_peer_id: str | None = None,
        timeout_seconds: float = 300.0,
    ) -> None:
        self._discovery: Any = discovery_service
        self._explicit_protocol_id = protocol_id
        self._explicit_local_peer_id = local_peer_id
        self._timeout_seconds = timeout_seconds

    # Resolved on first use, so building the dispatcher never touches a service that is not up yet.
    @property
    def _protocol_id(self) -> str:
        if self._explicit_protocol_id is not None:
            return self._explicit_protocol_id
        from quantum_backend_v2.libp2p.protocol_ids import build_execution_protocol_ids

        namespace = self._discovery.settings.rendezvous_namespace
        return build_execution_protocol_ids(namespace).compute_task

    @property
    def _local_peer_id(self) -> str:
        if self._explicit_local_peer_id is not None:
            return self._explicit_local_peer_id
        return str(self._discovery.libp2p_runtime.host.get_id())

    def peers(self) -> list[Any]:
        """Healthy remote peers, i.e. every registered peer except this coordinator."""
        if self._discovery is None:
            return []
        return [
            peer
            for peer in self._discovery.registry.list_peers(include_stale=False)
            if peer.health_status == "healthy" and peer.peer_id != self._local_peer_id
        ]

    def label_of(self, peer_id: str) -> str:
        """What the dashboard shows for a peer: its label when it has one."""
        if self._discovery is None or peer_id in (LOCAL, "cache"):
            return peer_id
        peer = self._discovery.registry.get_peer(peer_id)
        return (peer.label if peer is not None and peer.label else None) or peer_id[-8:]

    async def run(
        self,
        kind: str,
        inputs: list[dict[str, Any]] | None,
        *,
        run_locally: Callable[[dict[str, Any]], dict[str, Any]],
        on_event: Callable[[str], None] = lambda message: None,
        on_task: TaskListener = lambda index, state, peer_id, detail: None,
        groups: list[Hashable] | None = None,
        filecoin_store: FilecoinStore | None = None,
        dataset_receipt: FilecoinReceipt | None = None,
        checkpoint_receipt: FilecoinReceipt | None = None,
        checkpoint_namespace: str | None = None,
        on_checkpoint: CheckpointCallback | None = None,
    ) -> list[TaskOutcome | None]:
        """Run the inputs as `kind` tasks; outcomes come back in input order.

        Tasks that share a group are interchangeable (redundant starts of one fragment): the first
        to finish wins and the rest are abandoned, so a slow peer never holds the call up. An
        abandoned or unneeded task has no outcome (None).

        Filecoin is opt-in. Inputs are verified before dispatch; checkpoints resume
        completed tasks, never an optimizer's partial iterations. The callback must
        durably save each receipt; a failed upload or callback stops this call.
        """
        checkpoint_requested = any(
            value is not None for value in (checkpoint_receipt, checkpoint_namespace, on_checkpoint)
        )
        if (dataset_receipt is not None or checkpoint_requested) and filecoin_store is None:
            raise ValueError("Filecoin task inputs/checkpoints require a configured store")
        if checkpoint_requested and (checkpoint_namespace is None or on_checkpoint is None):
            raise ValueError("Filecoin checkpoints require a namespace and receipt callback")
        if filecoin_store is not None:
            from quantum_backend_v2.application.filecoin_tasks import resolve_inputs

            inputs = await resolve_inputs(kind, inputs, filecoin_store, dataset_receipt)
        if inputs is None:
            raise ValueError("Task inputs are required")
        count = len(inputs)
        if groups is not None and len(groups) != count:
            raise ValueError("Task groups must have one entry per input")
        group_of: list[Hashable] = groups if groups is not None else list(range(count))
        outcomes: list[TaskOutcome | None] = [None] * count
        attempts = [0] * count
        tried: list[set[str]] = [set() for _ in inputs]
        pending = list(range(count))
        dropped: set[str] = set()
        inflight: dict[int, asyncio.Future[dict[str, Any]]] = {}
        done_groups: set[Hashable] = set()
        journal = None
        if checkpoint_requested:
            from quantum_backend_v2.application.filecoin_tasks import CheckpointJournal

            assert filecoin_store is not None and checkpoint_namespace is not None
            assert on_checkpoint is not None
            journal = CheckpointJournal(
                store=filecoin_store,
                namespace=checkpoint_namespace,
                kind=kind,
                inputs=inputs,
                groups=group_of,
                on_checkpoint=on_checkpoint,
            )
            if checkpoint_receipt is not None:
                for index, saved in (await journal.restore(checkpoint_receipt)).items():
                    outcomes[index] = TaskOutcome(**saved.model_dump())
                    done_groups.add(group_of[index])
                pending = [index for index in pending if group_of[index] not in done_groups]
        for index in range(count):
            restored = outcomes[index]
            if restored is not None:
                on_task(index, "done", restored.executed_by, "restored from Filecoin checkpoint")
            elif group_of[index] in done_groups:
                on_task(index, "superseded", None, None)
            else:
                on_task(index, "queued", None, None)

        def finish_group(winner: int) -> None:
            done_groups.add(group_of[winner])
            for other in range(count):
                if other == winner or group_of[other] != group_of[winner] or outcomes[other]:
                    continue
                if other in pending:
                    pending.remove(other)
                if other in inflight:
                    inflight[other].cancel()
                on_task(other, "superseded", None, None)

        async def peer_loop(peer: Any) -> None:
            while True:
                index = next(
                    (
                        i
                        for i in pending
                        if peer.peer_id not in tried[i] and group_of[i] not in done_groups
                    ),
                    None,
                )
                if index is None:
                    return
                pending.remove(index)
                attempts[index] += 1
                tried[index].add(peer.peer_id)
                on_task(index, "running", peer.peer_id, None)
                started = time.perf_counter()
                request = asyncio.ensure_future(self._send(peer, kind, inputs[index]))
                inflight[index] = request
                try:
                    output = await request
                except asyncio.CancelledError:
                    if group_of[index] in done_groups:
                        return  # abandoned; the peer may still be computing, so retire it
                    request.cancel()
                    raise
                except Exception as exc:  # unreachable, timed out, or cannot run this kind
                    if group_of[index] not in done_groups:
                        pending.insert(0, index)
                    dropped.add(peer.peer_id)
                    on_task(index, "failed", peer.peer_id, f"{type(exc).__name__}: {exc}")
                    on_event(
                        f"peer {self.label_of(peer.peer_id)} dropped "
                        f"({type(exc).__name__}: {exc}); task {index + 1} rerouted"
                    )
                    logger.warning("peer %s dropped for %s: %r", peer.peer_id, kind, exc)
                    return
                finally:
                    inflight.pop(index, None)
                if group_of[index] in done_groups:
                    return
                outcomes[index] = TaskOutcome(
                    output=output,
                    executed_by=peer.peer_id,
                    attempts=attempts[index],
                    elapsed_seconds=time.perf_counter() - started,
                )
                on_task(index, "done", peer.peer_id, None)
                finish_group(index)
                if journal is not None:
                    await journal.save(outcomes)

        async def gather_workers(work: list[Coroutine[Any, Any, None]]) -> None:
            workers = [asyncio.create_task(item) for item in work]
            try:
                await asyncio.gather(*workers)
            except BaseException:
                for worker in workers:
                    worker.cancel()
                await asyncio.gather(*workers, return_exceptions=True)
                raise

        # A dropped peer can re-queue work after the others went idle, so run another pass.
        while pending:
            alive = [peer for peer in self.peers() if peer.peer_id not in dropped]
            waiting, dropped_before = len(pending), len(dropped)
            await gather_workers([peer_loop(peer) for peer in alive])
            if len(pending) == waiting and len(dropped) == dropped_before:
                break

        # On one machine redundant starts add nothing, so the fallback runs one task per group.
        first_per_group: dict[Hashable, int] = {}
        for i in range(count):
            if outcomes[i] is None and group_of[i] not in done_groups:
                first_per_group.setdefault(group_of[i], i)
        leftovers = list(first_per_group.values())
        if leftovers:
            on_event(f"{len(leftovers)} task(s) ran on the coordinator (no peer could take them)")
            semaphore = asyncio.Semaphore(os.cpu_count() or 1)

            async def local(index: int) -> None:
                async with semaphore:
                    if group_of[index] in done_groups:
                        return  # a sibling start already finished
                    on_task(index, "running", LOCAL, None)
                    started = time.perf_counter()
                    output = await asyncio.to_thread(run_locally, inputs[index])
                    if group_of[index] in done_groups:
                        return
                    outcomes[index] = TaskOutcome(
                        output=output,
                        executed_by=LOCAL,
                        attempts=attempts[index] + 1,
                        elapsed_seconds=time.perf_counter() - started,
                    )
                    on_task(index, "done", LOCAL, None)
                    finish_group(index)
                    if journal is not None:
                        await journal.save(outcomes)

            await gather_workers([local(i) for i in leftovers])
        return outcomes

    async def _send(self, peer: Any, kind: str, task_input: dict[str, Any]) -> dict[str, Any]:
        request = ComputeTaskRequest(task_id=f"task-{uuid.uuid4()}", kind=kind, input=task_input)
        raw = await self._discovery.request_peer_rpc(
            peer_id=peer.peer_id,
            protocol_id=self._protocol_id,
            payload=request.model_dump_json().encode("utf-8"),
            peer_addresses=tuple(peer.network_addresses),
            timeout_seconds=self._timeout_seconds,
        )
        response = ComputeTaskResponse.model_validate_json(raw)
        if not response.ok or response.output is None:
            raise RuntimeError(response.error or "peer returned no output")
        return response.output
