"""Top-level application bootstrap."""

from __future__ import annotations

from collections.abc import Mapping

from fastapi import FastAPI

from quantum_backend_v2.application.parity import CircuitJobService, FinancialJobService, OptionsJobService
from quantum_backend_v2.api.app import create_app
from quantum_backend_v2.bootstrap.libp2p import create_libp2p_plan, create_libp2p_runtime
from quantum_backend_v2.config import load_settings
from quantum_backend_v2.bootstrap.persistence import create_persistence_runtime
from quantum_backend_v2.discovery.service import build_discovery_service
from quantum_backend_v2.observability import configure_logging
from quantum_backend_v2.reservations.service import ReservationService
from quantum_backend_v2.runtime.recovery import RuntimeRecoveryService
from quantum_backend_v2.bootstrap.libp2p import create_libp2p_plan, create_libp2p_runtime
from quantum_backend_v2.config import load_settings
from quantum_backend_v2.bootstrap.persistence import create_persistence_runtime
from quantum_backend_v2.discovery.service import build_discovery_service
from quantum_backend_v2.observability import configure_logging
from quantum_backend_v2.reservations.service import ReservationService
from quantum_backend_v2.runtime.recovery import RuntimeRecoveryService


def create_application(env: Mapping[str, str] | None = None) -> FastAPI:
    """Build a configured FastAPI application."""
    settings = load_settings(env=env)
    configure_logging(settings.logging)
    persistence_runtime = create_persistence_runtime(settings.persistence)
    libp2p_plan = create_libp2p_plan(settings.libp2p)
    libp2p_runtime = create_libp2p_runtime(settings.libp2p)
    discovery_service = build_discovery_service(
        settings=settings.libp2p,
        libp2p_runtime=libp2p_runtime,
        mongo_runtime=persistence_runtime.mongodb,
        session_factory=persistence_runtime.postgres_session_factory,
        enforce_enrollment=settings.auth_required,
    )
    session_factory = persistence_runtime.postgres_session_factory
    circuit_job_service = None
    financial_job_service = None
    options_job_service = None
    reservation_service = None
    runtime_recovery_service = None
    if session_factory is not None:
        circuit_job_service = CircuitJobService(
            session_factory=session_factory,
            discovery_service=discovery_service,
            libp2p_runtime=libp2p_runtime,
        )
        financial_job_service = FinancialJobService(
            session_factory=session_factory,
            discovery_service=discovery_service,
            libp2p_runtime=libp2p_runtime,
        )
        options_job_service = OptionsJobService(session_factory=session_factory)
        reservation_service = ReservationService(session_factory=session_factory)
        runtime_recovery_service = RuntimeRecoveryService(session_factory=session_factory)
    return create_app(
        settings,
        persistence_runtime=persistence_runtime,
        libp2p_plan=libp2p_plan,
        libp2p_runtime=libp2p_runtime,
        discovery_service=discovery_service,
        circuit_job_service=circuit_job_service,
        financial_job_service=financial_job_service,
        options_job_service=options_job_service,
        reservation_service=reservation_service,
        runtime_recovery_service=runtime_recovery_service,
    )
