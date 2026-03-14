"""Gate execution adapter contracts for remote libp2p invocation."""

from __future__ import annotations

import json
from typing import Protocol

from quantum_coordinator.planning.models import CircuitFragment
from quantum_coordinator.runtime.models import GateExecutionResult


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


class Libp2pGateInvoker(Protocol):
    """Minimal gate invocation transport used by libp2p adapter."""

    async def invoke_gate(
        self,
        node_id: str,
        payload: bytes,
        timeout_seconds: float,
    ) -> bytes:
        """Invoke gate protocol on remote node."""


class Libp2pGateExecutionAdapter(GateExecutionAdapter):
    """Gate adapter that invokes remote service nodes over py-libp2p streams."""

    def __init__(self, invoker: Libp2pGateInvoker, min_fidelity: float = 0.8) -> None:
        self._invoker = invoker
        self._min_fidelity = min_fidelity

    async def execute(
        self,
        fragment: CircuitFragment,
        node_id: str,
        timeout_seconds: float,
    ) -> GateExecutionResult:
        request = {
            "fragment_id": fragment.fragment_id,
            "service_type": fragment.service_type.value,
            "qubits": list(fragment.qubits),
            "timeout_seconds": timeout_seconds,
            "min_fidelity": self._min_fidelity,
        }
        raw_response = await self._invoker.invoke_gate(
            node_id=node_id,
            payload=json.dumps(request, separators=(",", ":"), sort_keys=True).encode("utf-8"),
            timeout_seconds=timeout_seconds,
        )

        try:
            payload = json.loads(raw_response.decode("utf-8"))
            success = bool(payload.get("success", False))
            observed_fidelity = float(payload.get("observed_fidelity", 0.0))
            error_raw = payload.get("error")
            error = None if error_raw is None else str(error_raw)
            return GateExecutionResult(
                success=success,
                observed_fidelity=observed_fidelity,
                error=error,
            )
        except Exception:
            return GateExecutionResult(
                success=False,
                observed_fidelity=0.0,
                error="invalid_gate_response",
            )


class LocalGateExecutionAdapter(GateExecutionAdapter):
    """Simple in-process adapter used when libp2p is unavailable.

    This simulates successful gate execution without any real network calls so that
    the coordinator API remains usable in restricted environments.
    """

    def __init__(self, observed_fidelity: float = 0.95) -> None:
        self._observed_fidelity = observed_fidelity

    async def execute(
        self,
        fragment: CircuitFragment,
        node_id: str,
        timeout_seconds: float,
    ) -> GateExecutionResult:
        # For now we just report a successful execution with a fixed fidelity.
        # The fragment, node_id, and timeout are accepted for interface parity.
        return GateExecutionResult(
            success=True,
            observed_fidelity=self._observed_fidelity,
            error=None,
        )
