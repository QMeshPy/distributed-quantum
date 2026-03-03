"""Gate execution adapter contracts and in-memory test adapter."""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from enum import Enum

import anyio

from quantum_coordinator.planning.models import CircuitFragment
from quantum_coordinator.runtime.models import GateExecutionResult


class InjectedFailure(str, Enum):
    """Failure modes used by integration tests."""

    TIMEOUT = "TIMEOUT"
    REJECT = "REJECT"
    NODE_DROP = "NODE_DROP"
    QUALITY_DEGRADED = "QUALITY_DEGRADED"
    SUCCESS = "SUCCESS"


class GateExecutionAdapter:
    """Protocol-like base class for runtime invocation adapters."""

    async def execute(
        self,
        fragment: CircuitFragment,
        node_id: str,
        timeout_seconds: float,
    ) -> GateExecutionResult:
        """Execute a fragment on a specific node."""
        raise NotImplementedError


@dataclass(frozen=True)
class NodeExecutionProfile:
    """Default behavior of a node in the in-memory adapter."""

    fidelity: float
    latency_seconds: float = 0.0


class InMemoryGateExecutionAdapter(GateExecutionAdapter):
    """In-memory execution adapter with programmable failure injection."""

    def __init__(self, profiles: dict[str, NodeExecutionProfile]) -> None:
        self._profiles = profiles
        self._injections: dict[str, deque[InjectedFailure]] = defaultdict(deque)

    def inject(self, node_id: str, *failures: InjectedFailure) -> None:
        """Inject ordered failure/success outcomes for a node."""
        self._injections[node_id].extend(failures)

    async def execute(
        self,
        fragment: CircuitFragment,
        node_id: str,
        timeout_seconds: float,
    ) -> GateExecutionResult:
        profile = self._profiles.get(node_id)
        if profile is None:
            raise ConnectionError(f"Unknown node {node_id!r}")

        if profile.latency_seconds > 0.0:
            await anyio.sleep(profile.latency_seconds)

        queue = self._injections[node_id]
        outcome = queue.popleft() if queue else InjectedFailure.SUCCESS

        if outcome == InjectedFailure.TIMEOUT:
            await anyio.sleep(timeout_seconds + 0.05)
            return GateExecutionResult(success=False, observed_fidelity=0.0, error="timeout")

        if outcome == InjectedFailure.REJECT:
            return GateExecutionResult(success=False, observed_fidelity=0.0, error="rejected")

        if outcome == InjectedFailure.NODE_DROP:
            raise ConnectionError(f"Node {node_id} dropped")

        if outcome == InjectedFailure.QUALITY_DEGRADED:
            return GateExecutionResult(
                success=True,
                observed_fidelity=max(0.0, profile.fidelity - 0.4),
                error=None,
            )

        _ = fragment
        return GateExecutionResult(success=True, observed_fidelity=profile.fidelity, error=None)
