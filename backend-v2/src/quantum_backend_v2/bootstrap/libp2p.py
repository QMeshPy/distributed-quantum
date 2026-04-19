"""Libp2p bootstrap helpers."""

from __future__ import annotations

from quantum_backend_v2.config import Libp2pSettings
from quantum_backend_v2.libp2p import (
    Libp2pBootstrapPlan,
    Libp2pRuntime,
    create_libp2p_bootstrap_plan,
    create_real_libp2p_runtime,
)


def create_libp2p_plan(settings: Libp2pSettings) -> Libp2pBootstrapPlan:
    """Create the developer-facing libp2p bootstrap plan."""
    return create_libp2p_bootstrap_plan(settings)


def create_libp2p_runtime(settings: Libp2pSettings) -> Libp2pRuntime:
    """Create the real py-libp2p runtime for backend-v2."""
    return create_real_libp2p_runtime(settings)
