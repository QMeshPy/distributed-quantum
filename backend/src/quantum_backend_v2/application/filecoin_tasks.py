"""Versioned Filecoin inputs and explicit checkpoints for independent compute tasks."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Hashable, Sequence
from dataclasses import asdict
from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from quantum_backend_v2.artifacts.filecoin import MAX_BYTES, FilecoinReceipt, FilecoinStore
from quantum_backend_v2.provenance.hashing import canonical_json, hash_json

if TYPE_CHECKING:
    from quantum_backend_v2.application.peer_tasks import TaskOutcome

CheckpointCallback = Callable[[FilecoinReceipt], Awaitable[None]]


class TaskDataset(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    schema_version: Literal["qmesh-filecoin-task-dataset-v1"] = "qmesh-filecoin-task-dataset-v1"
    kind: str = Field(min_length=3, max_length=64)
    inputs: list[dict[str, Any]] = Field(min_length=1, max_length=64)


class SavedOutcome(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    output: dict[str, Any]
    executed_by: str = Field(min_length=1, max_length=256)
    attempts: int = Field(ge=1)
    elapsed_seconds: float = Field(ge=0, allow_inf_nan=False)


class TaskCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    schema_version: Literal["qmesh-filecoin-task-checkpoint-v1"] = (
        "qmesh-filecoin-task-checkpoint-v1"
    )
    namespace: str = Field(min_length=1, max_length=256)
    kind: str = Field(min_length=3, max_length=64)
    input_hashes: list[str] = Field(min_length=1, max_length=64)
    group_indices: list[int] = Field(min_length=1, max_length=64)
    completed: dict[str, SavedOutcome] = Field(max_length=64)


def create_dataset(kind: str, inputs: list[dict[str, Any]]) -> bytes:
    """Create the portable dataset consumed by PeerTaskDispatcher.run()."""
    dataset = TaskDataset(kind=kind, inputs=inputs)
    data = canonical_json(dataset.model_dump())
    if len(data) > MAX_BYTES:
        raise ValueError("Task dataset exceeds the Filecoin size limit")
    return data


async def resolve_inputs(
    kind: str,
    inputs: list[dict[str, Any]] | None,
    store: FilecoinStore,
    receipt: FilecoinReceipt | None,
) -> list[dict[str, Any]]:
    """Hydrate verified inputs on the coordinator before either remote or local execution."""
    if receipt is not None:
        if not receipt.complete:
            raise ValueError("Task dataset storage is incomplete")
        dataset = TaskDataset.model_validate_json(await store.download(receipt))
        if dataset.kind != kind:
            raise ValueError("Task dataset kind does not match the request")
        if inputs is not None and hash_json(inputs) != hash_json(dataset.inputs):
            raise ValueError("Task dataset inputs do not match the request")
        inputs = dataset.inputs
    if inputs is None:
        raise ValueError("Task inputs or a dataset receipt are required")
    create_dataset(kind, inputs)
    return inputs


class CheckpointPersistenceError(RuntimeError):
    """Do not retry a write: receipt is the last known, retrievable checkpoint."""

    def __init__(self, receipt: FilecoinReceipt | None) -> None:
        super().__init__("Filecoin checkpoint persistence failed; inspect receipts before resuming")
        self.receipt = receipt


class CheckpointJournal:
    """Serialize checkpoint writes and stop on uncertain storage or receipt persistence."""

    def __init__(
        self,
        *,
        store: FilecoinStore,
        namespace: str,
        kind: str,
        inputs: list[dict[str, Any]],
        groups: Sequence[Hashable],
        on_checkpoint: CheckpointCallback,
    ) -> None:
        group_numbers: dict[Hashable, int] = {}
        group_indices = [
            group_numbers.setdefault(group, index) for index, group in enumerate(groups)
        ]
        self.template = TaskCheckpoint(
            namespace=namespace,
            kind=kind,
            input_hashes=[hash_json(value) for value in inputs],
            group_indices=group_indices,
            completed={},
        )
        self.store = store
        self.on_checkpoint = on_checkpoint
        self.receipt: FilecoinReceipt | None = None
        self._last_hash: str | None = None
        self._failed = False
        self._lock = asyncio.Lock()

    async def restore(self, receipt: FilecoinReceipt) -> dict[int, SavedOutcome]:
        if not receipt.complete:
            raise ValueError("Filecoin checkpoint storage is incomplete")
        saved = TaskCheckpoint.model_validate_json(await self.store.download(receipt))
        if saved.model_dump(exclude={"completed"}) != self.template.model_dump(
            exclude={"completed"}
        ):
            raise ValueError("Filecoin checkpoint does not match the run, inputs, kind, or groups")
        restored: dict[int, SavedOutcome] = {}
        completed_groups: set[int] = set()
        for key, outcome in saved.completed.items():
            try:
                index = int(key)
            except ValueError:
                raise ValueError("Invalid Filecoin checkpoint task index") from None
            if key != str(index) or not 0 <= index < len(self.template.input_hashes):
                raise ValueError("Invalid Filecoin checkpoint task index")
            group = self.template.group_indices[index]
            if group in completed_groups:
                raise ValueError("Filecoin checkpoint has multiple winners for one group")
            completed_groups.add(group)
            restored[index] = outcome
        self.receipt = receipt
        self._last_hash = hash_json(saved.model_dump())
        return restored

    async def save(self, outcomes: Sequence[TaskOutcome | None]) -> None:
        async with self._lock:
            if self._failed:
                raise CheckpointPersistenceError(self.receipt)
            try:
                payload = {
                    **self.template.model_dump(),
                    "completed": {
                        str(index): asdict(outcome)
                        for index, outcome in enumerate(outcomes)
                        if outcome is not None
                    },
                }
                checkpoint = TaskCheckpoint.model_validate(payload)
                digest = hash_json(checkpoint.model_dump())
                if digest == self._last_hash:
                    return
                data = canonical_json(checkpoint.model_dump())
                if len(data) > MAX_BYTES:
                    raise ValueError("Task checkpoint exceeds the Filecoin size limit")
                self.receipt = await self.store.upload(data)
                await self.on_checkpoint(self.receipt)
                self._last_hash = digest
            except Exception as exc:
                self._failed = True
                raise CheckpointPersistenceError(self.receipt) from exc
