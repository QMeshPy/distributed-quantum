"""Cost model scoring for fragment-to-node assignment."""

from __future__ import annotations

import hashlib

from quantum_coordinator.planning.models import CandidateScore, CircuitFragment, PlannerConfig
from quantum_coordinator.service_discovery.advertisement import ServiceAdvertisement


def score_candidate(
    fragment: CircuitFragment,
    advertisement: ServiceAdvertisement,
    config: PlannerConfig,
) -> CandidateScore:
    """Score one candidate node for a fragment using deterministic pseudo-metrics."""
    jitter = _deterministic_fraction(
        f"{fragment.fragment_id}|{advertisement.node_id}|{config.seed}"
    )

    # These values are deterministic and replace live telemetry in the current POC phase.
    latency_cost = (5.0 + 45.0 * jitter) / 100.0
    failure_risk_cost = max(0.0, 1.0 - advertisement.fidelity)
    entanglement_cost = max(0.0, float(len(fragment.qubits) - 1))
    load_cost = _deterministic_fraction(f"load|{advertisement.node_id}|{config.seed}")

    weights = config.weights
    total_cost = (
        weights.w_lat * latency_cost
        + weights.w_fail * failure_risk_cost
        + weights.w_ent * entanglement_cost
        + weights.w_load * load_cost
    )

    return CandidateScore(
        node_id=advertisement.node_id,
        total_cost=round(total_cost, 6),
        latency_cost=round(latency_cost, 6),
        failure_risk_cost=round(failure_risk_cost, 6),
        entanglement_cost=round(entanglement_cost, 6),
        load_cost=round(load_cost, 6),
        fidelity=advertisement.fidelity,
    )


def _deterministic_fraction(key: str) -> float:
    digest = hashlib.sha256(key.encode("utf-8")).digest()
    value = int.from_bytes(digest[:8], "big")
    max_u64 = 2**64 - 1
    return value / max_u64
