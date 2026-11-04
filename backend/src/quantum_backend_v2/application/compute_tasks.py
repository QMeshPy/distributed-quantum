"""Task kinds a peer can run for a coordinator. Heavy imports stay inside each task, so a peer
only needs a library when it is actually handed a task that uses it."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

PHARMA_VQE = "pharma.vqe"


def run_pharma_vqe(payload: dict[str, Any]) -> dict[str, Any]:
    from quantum_backend_v2.pharma.vqe_kernel import run_vqe

    return run_vqe(
        payload["problem"], max_iterations=payload["max_iterations"], seed=payload.get("seed")
    )


TASK_KINDS: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {PHARMA_VQE: run_pharma_vqe}
