"""Versioned API routers."""

from quantum_backend_v2.api.routers.discovery import build_discovery_router as discovery_router
from quantum_backend_v2.api.routers.system import build_router as system_router

__all__ = ["discovery_router", "system_router"]
