"""Wire schemas for generic compute tasks a coordinator hands to a peer (e.g. one VQE fragment)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ComputeTaskRequest(BaseModel):
    """Run task `kind` on `input` and return its output."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    task_id: str = Field(min_length=8)
    kind: str = Field(min_length=3, max_length=64)
    input: dict[str, Any] = Field(default_factory=dict)


class ComputeTaskResponse(BaseModel):
    """The peer's answer. `ok=False` means the peer could not run the task; reroute it."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    task_id: str
    executing_peer_id: str
    ok: bool
    output: dict[str, Any] | None = None
    error: str | None = None
    latency_ms: float | None = None
