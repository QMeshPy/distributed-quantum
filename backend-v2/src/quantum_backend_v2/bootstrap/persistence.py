"""Persistence bootstrap helpers."""

from __future__ import annotations

from quantum_backend_v2.config import PersistenceSettings
from quantum_backend_v2.persistence import PersistenceRuntime


def create_persistence_runtime(settings: PersistenceSettings) -> PersistenceRuntime:
    """Create the hybrid persistence runtime from validated settings."""
    return PersistenceRuntime.from_settings(settings)
