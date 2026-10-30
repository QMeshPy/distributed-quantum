"""FastAPI application assembly."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import timedelta
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response

from api.v1.agents import router as agents_router
from api.v1.starknet_sessions import router as starknet_sessions_router
from api.v1.chat_sessions import router as chat_sessions_router
from api.v1.ens import router as ens_router
from api.v1.ens_workers import router as ens_workers_router
from api.v1.marketplace import router as marketplace_router
from api.v1.notifications import router as notifications_router
from api.v1.proposals import router as proposals_router

# AgentKit integration routers (new v1 API routers)
from api.v1.wallet import router as wallet_router
from quantum_backend_v2 import __version__
from quantum_backend_v2.api.benchmark import router as benchmark_router
from quantum_backend_v2.api.deps.auth import configure_auth
from quantum_backend_v2.api.deps.wallet import build_wallet_service
from quantum_backend_v2.api.errors import register_exception_handlers
from quantum_backend_v2.api.routers import discovery_router, system_router
from quantum_backend_v2.api.routers.agent import router as agent_router
from quantum_backend_v2.api.routers.chains import build_chains_router
from quantum_backend_v2.api.routers.circuits import build_circuits_router
from quantum_backend_v2.api.routers.credits import build_credits_router
from quantum_backend_v2.api.routers.enrollment import build_enrollment_router
from quantum_backend_v2.api.routers.financial import build_financial_router
from quantum_backend_v2.api.routers.options import build_options_router
from quantum_backend_v2.api.routers.payments_admin import build_payments_admin_router
from quantum_backend_v2.api.routers.pharma import router as pharma_router
from quantum_backend_v2.api.routers.plans import build_plans_router
from quantum_backend_v2.api.routers.provenance import build_provenance_router
from quantum_backend_v2.api.routers.reservations import build_reservations_router
from quantum_backend_v2.api.routers.risk import build_risk_router
from quantum_backend_v2.api.routers.services import build_services_router
from quantum_backend_v2.api.routers.workflows import build_workflows_router
from quantum_backend_v2.application.parity import (
    CircuitJobService,
    FinancialJobService,
    RiskJobService,
)
from quantum_backend_v2.application.provenance import MongoProvenanceRepository
from quantum_backend_v2.chains.models import ChainRegistry
from quantum_backend_v2.config import AppSettings
from quantum_backend_v2.discovery.service import DiscoveryService
from quantum_backend_v2.libp2p import Libp2pBootstrapPlan, Libp2pRuntime
from quantum_backend_v2.payments.credits import JobCreditMeter
from quantum_backend_v2.payments.ledger import LedgerService
from quantum_backend_v2.payments.onchain_payouts import wallet_payout_rail
from quantum_backend_v2.payments.payouts import FragmentPayoutService, PayoutSettler
from quantum_backend_v2.persistence import PersistenceRuntime
from quantum_backend_v2.provenance.service import ProvenanceService
from quantum_backend_v2.reservations.service import ReservationService
from quantum_backend_v2.runtime.recovery import RuntimeRecoveryService

logger = logging.getLogger(__name__)


def create_app(
    settings: AppSettings,
    *,
    chain_registry: ChainRegistry,
    persistence_runtime: PersistenceRuntime,
    libp2p_plan: Libp2pBootstrapPlan,
    libp2p_runtime: Libp2pRuntime,
    discovery_service: DiscoveryService,
    circuit_job_service: CircuitJobService | None,
    financial_job_service: FinancialJobService | None,
    options_job_service: Any | None = None,
    risk_job_service: RiskJobService | None = None,
    reservation_service: ReservationService | None = None,
    runtime_recovery_service: RuntimeRecoveryService | None = None,
    provenance_service: ProvenanceService | None = None,
) -> FastAPI:
    """Create the backend FastAPI application."""
    configure_auth(
        enabled=settings.auth_required,
        allow_dev_bearer_tokens=settings.allow_dev_bearer_tokens,
    )
    started_monotonic = time.monotonic()
    mongodb = persistence_runtime.mongodb
    ledger_service = LedgerService(mongodb.database) if mongodb is not None else None
    reconcile_interval = int(os.getenv("QB2_PAYMENT_RECONCILE_INTERVAL_SECONDS", "300"))
    credit_meter = (
        JobCreditMeter(ledger_service, cost=settings.circuit_job_credit_cost)
        if ledger_service is not None and settings.circuit_job_credit_cost > 0
        else None
    )
    payout_settings = settings.worker_payouts
    payout_service = (
        FragmentPayoutService(
            mongodb.database, ledger_service, min_fidelity=payout_settings.min_fidelity
        )
        if mongodb is not None and ledger_service is not None
        else None
    )
    if circuit_job_service is not None:
        circuit_job_service.payouts = payout_service
    payout_settler = None
    if payout_service is not None and payout_settings.wallet_address is not None:
        send, verify = wallet_payout_rail(
            lambda: build_wallet_service(app), from_address=payout_settings.wallet_address
        )
        payout_settler = PayoutSettler(
            mongodb.database,
            send=send,
            verify=verify,
            threshold=payout_settings.threshold,
            max_age=timedelta(seconds=payout_settings.max_age_seconds),
        )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> Any:
        await persistence_runtime.startup()
        reconcile_task = settle_task = None
        if ledger_service is not None:
            await ledger_service.ensure_indexes()
            if reconcile_interval > 0:
                reconcile_task = asyncio.create_task(
                    _reconcile_periodically(ledger_service, reconcile_interval)
                )
        if payout_service is not None:
            await payout_service.ensure_indexes()
        if payout_settler is not None:
            await payout_settler.ensure_indexes()
            if payout_settings.interval_seconds > 0:
                settle_task = asyncio.create_task(
                    _settle_payouts_periodically(payout_settler, payout_settings.interval_seconds)
                )
        if runtime_recovery_service is not None:
            open_reservations = await runtime_recovery_service.recover_open_reservations()
            in_flight_executions = await runtime_recovery_service.recover_in_flight_executions()
            app.state.runtime_recovery = {
                "open_reservations": open_reservations,
                "in_flight_executions": in_flight_executions,
            }
        else:
            app.state.runtime_recovery = {
                "open_reservations": [],
                "in_flight_executions": [],
            }

        await discovery_service.start()
        try:
            yield
        finally:
            for task in (reconcile_task, settle_task):
                if task is not None:
                    task.cancel()
            for service_name in ("proposal_service", "ai_agent_service", "marketplace_service"):
                service = getattr(app.state, service_name, None)
                if service is not None:
                    service.mongo_client.close()
                    bedrock = getattr(service, "bedrock", None)
                    if bedrock is not None:
                        bedrock.close()
            wallet_service = getattr(app.state, "wallet_service", None)
            if wallet_service is not None:
                wallet_service.mongo_client.close()
            await discovery_service.stop()
            await persistence_runtime.shutdown()

    app = FastAPI(
        title="Quantum Backend V2",
        version=__version__,
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    app.state.chain_registry = chain_registry
    app.state.wallet_chain_id = chain_registry.resolve(settings.wallet_network).chain_id

    cors_origins_env = os.getenv("CORS_ORIGINS", "")
    if cors_origins_env:
        cors_origins = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip()]
    else:
        cors_origins = [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
        ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/", include_in_schema=False)
    async def root() -> RedirectResponse:
        return RedirectResponse(url="/docs")

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon() -> Response:
        return Response(status_code=204)

    register_exception_handlers(app)
    app.include_router(build_chains_router(registry=chain_registry))

    app.include_router(
        system_router(
            service_name=settings.service_name,
            environment=settings.environment,
            started_monotonic=started_monotonic,
            version=__version__,
            persistence_runtime=persistence_runtime,
            libp2p_plan=libp2p_plan,
            libp2p_runtime=libp2p_runtime,
        )
    )
    app.include_router(
        build_provenance_router(
            service=provenance_service or ProvenanceService(MongoProvenanceRepository())
        )
    )
    app.include_router(discovery_router(discovery_service=discovery_service))
    app.include_router(build_enrollment_router())
    app.include_router(build_workflows_router(mongo_runtime=persistence_runtime.mongodb))
    if circuit_job_service is not None:
        app.include_router(
            build_circuits_router(
                job_service=circuit_job_service,
                x402_gateway_secret=settings.x402_gateway_secret,
                credit_meter=credit_meter,
                payout_service=payout_service,
            )
        )
    app.include_router(build_services_router(discovery_service=discovery_service))
    if circuit_job_service is not None:
        app.include_router(build_plans_router(job_service=circuit_job_service))
    if financial_job_service is not None:
        app.include_router(build_financial_router(financial_job_service=financial_job_service))
    if options_job_service is not None:
        app.include_router(
            build_options_router(
                options_job_service=options_job_service,
                x402_gateway_secret=settings.x402_gateway_secret,
            )
        )
    if risk_job_service is not None:
        app.include_router(build_risk_router(risk_job_service=risk_job_service))
    if reservation_service is not None:
        app.include_router(build_reservations_router(reservation_service=reservation_service))

    if ledger_service is not None:
        app.include_router(build_payments_admin_router(ledger_service=ledger_service))
        app.include_router(
            build_credits_router(
                ledger_service=ledger_service,
                circuit_job_cost=settings.circuit_job_credit_cost,
                billing_internal_secret=settings.billing_internal_secret,
            )
        )

    app.include_router(benchmark_router)
    app.include_router(pharma_router)
    app.include_router(agent_router)

    # Register AgentKit integration routers (v1 API)
    app.include_router(wallet_router)
    app.include_router(starknet_sessions_router)
    app.include_router(agents_router)
    app.include_router(proposals_router)
    app.include_router(notifications_router)
    app.include_router(marketplace_router)
    app.include_router(chat_sessions_router)
    app.include_router(ens_router)
    app.include_router(ens_workers_router)

    return app


async def _reconcile_periodically(ledger_service: LedgerService, interval_seconds: int) -> None:
    """Run the payment reconciliation sweep until the app shuts down."""
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await ledger_service.run_reconciliation()
        except Exception:
            # A failed sweep must not stop later ones; the next run retries it.
            logger.exception("payment reconciliation sweep failed")


async def _settle_payouts_periodically(settler: PayoutSettler, interval_seconds: int) -> None:
    """Send due worker payout batches and confirm sent ones until the app shuts down."""
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            report = await settler.run_once()
            if report.sent or report.paid or report.returned or report.uncertain:
                logger.info("worker payouts: %s", report.model_dump())
        except Exception:
            logger.exception("worker payout settlement failed")
