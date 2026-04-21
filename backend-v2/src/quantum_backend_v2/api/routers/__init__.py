"""Versioned API router entrypoints."""

from __future__ import annotations

from typing import Any


def discovery_router(*args: Any, **kwargs: Any) -> Any:
    from quantum_backend_v2.api.routers.discovery import build_discovery_router

    return build_discovery_router(*args, **kwargs)


def build_enrollment_router(*args: Any, **kwargs: Any) -> Any:
    from quantum_backend_v2.api.routers.enrollment import build_enrollment_router as _builder

    return _builder(*args, **kwargs)


def build_reservations_router(*args: Any, **kwargs: Any) -> Any:
    from quantum_backend_v2.api.routers.reservations import build_reservations_router as _builder

    return _builder(*args, **kwargs)


def system_router(*args: Any, **kwargs: Any) -> Any:
    from quantum_backend_v2.api.routers.system import build_router

    return build_router(*args, **kwargs)


def build_workflows_router(*args: Any, **kwargs: Any) -> Any:
    from quantum_backend_v2.api.routers.workflows import build_workflows_router as _builder

    return _builder(*args, **kwargs)


__all__ = [
    "build_enrollment_router",
    "build_reservations_router",
    "build_workflows_router",
    "discovery_router",
    "system_router",
]
