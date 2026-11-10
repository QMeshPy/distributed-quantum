"""Top-level application bootstrap."""

from __future__ import annotations

from collections.abc import Mapping

from fastapi import FastAPI

from quantum_backend_v2.api.app import create_app
from quantum_backend_v2.application.anchoring import (
    EvmAnchorChain,
    ProvenanceAnchorService,
    RegistryAnchorAdapter,
)
from quantum_backend_v2.application.filecoin_archive import FilecoinBundleStorage
from quantum_backend_v2.application.filecoin_service import FilecoinConfig, FilecoinService
from quantum_backend_v2.application.parity import (
    CircuitJobService,
    FinancialJobService,
    OptionsJobService,
    RiskJobService,
)
from quantum_backend_v2.application.peer_tasks import PeerTaskDispatcher
from quantum_backend_v2.application.pharma_jobs import PharmaJobService
from quantum_backend_v2.application.price_sources import ChainlinkPriceSource
from quantum_backend_v2.application.provenance import (
    KUBO_BACKEND,
    GatewayBundleStorage,
    KuboBundlePublisher,
    MongoProvenanceRepository,
)
from quantum_backend_v2.application.tokenized_portfolio import ChainlinkHistorySource
from quantum_backend_v2.bootstrap.libp2p import create_libp2p_plan, create_libp2p_runtime
from quantum_backend_v2.bootstrap.persistence import create_persistence_runtime
from quantum_backend_v2.chains.loader import load_chain_registry
from quantum_backend_v2.chains.market_data import load_market_data
from quantum_backend_v2.config import load_settings
from quantum_backend_v2.config.loader import load_environment
from quantum_backend_v2.discovery.service import build_discovery_service
from quantum_backend_v2.observability import configure_logging
from quantum_backend_v2.provenance.near_registry import CHAIN_ID as NEAR_CHAIN_ID
from quantum_backend_v2.provenance.near_registry import NearRegistryAdapter
from quantum_backend_v2.provenance.service import ProvenanceService
from quantum_backend_v2.reservations.service import ReservationService
from quantum_backend_v2.runtime.recovery import RuntimeRecoveryService


def create_application(env: Mapping[str, str] | None = None) -> FastAPI:
    """Build a configured FastAPI application."""
    env = load_environment(env)
    settings = load_settings(env=env)
    chain_registry = load_chain_registry(settings.chain_registry_path)
    chain_registry.resolve(settings.wallet_network)
    configure_logging(settings.logging)
    persistence_runtime = create_persistence_runtime(settings.persistence)
    libp2p_plan = create_libp2p_plan(settings.libp2p)
    libp2p_runtime = create_libp2p_runtime(settings.libp2p)
    discovery_service = build_discovery_service(
        settings=settings.libp2p,
        libp2p_runtime=libp2p_runtime,
        mongo_runtime=persistence_runtime.mongodb,
        enforce_enrollment=settings.auth_required,
    )
    filecoin_config = FilecoinConfig.from_env(dict(env))
    filecoin_service = None
    if filecoin_config.enabled:
        if persistence_runtime.mongodb is None:
            raise ValueError("Filecoin requires MongoDB for durable operation journals")
        filecoin_service = FilecoinService(
            persistence_runtime.mongodb.database,
            filecoin_config,
            dict(env),
            dispatcher=PeerTaskDispatcher(discovery_service=discovery_service),
        )
    circuit_job_service = CircuitJobService(
        discovery_service=discovery_service,
        libp2p_runtime=libp2p_runtime,
        # Without a Kubo credential, bundles stay local and runs are unaffected.
        bundle_publisher=(
            KuboBundlePublisher(settings.kubo, public_gateway_url=settings.gateway.public_url)
            if settings.kubo.rpc_secret is not None
            else None
        ),
    )
    financial_job_service = FinancialJobService(
        filecoin_store=filecoin_service.reader if filecoin_service else None,
        price_source=ChainlinkPriceSource(chain_registry, env),
        history_source=ChainlinkHistorySource(load_market_data(), env),
        discovery_service=discovery_service,
        libp2p_runtime=libp2p_runtime,
    )
    options_job_service = OptionsJobService(price_source=ChainlinkPriceSource(chain_registry, env))
    risk_job_service = RiskJobService(price_source=ChainlinkPriceSource(chain_registry, env))
    pharma_job_service = PharmaJobService()
    reservation_service = ReservationService()
    runtime_recovery_service = RuntimeRecoveryService()
    storage_adapters = {KUBO_BACKEND: GatewayBundleStorage(settings.gateway)}
    if filecoin_service is not None:
        storage_adapters["filecoin"] = FilecoinBundleStorage(filecoin_service.reader)
    anchor_adapters = {}
    if settings.near_registry.configured:
        anchor_adapters[NEAR_CHAIN_ID] = NearRegistryAdapter(settings.near_registry)
    anchor_service = None
    anchor = settings.anchor
    if anchor.network is not None and anchor.sender is not None:
        # Unknown, disabled or non-anchoring networks fail startup instead of skipping checks.
        anchor_chain = chain_registry.resolve(anchor.network)
        anchor_adapters[anchor_chain.chain_id] = RegistryAnchorAdapter(
            anchor_chain, (anchor.sender, *anchor.past_senders), env
        )
        if anchor.private_key is not None:
            from eth_account import Account

            try:
                account = Account.from_key(anchor.private_key.get_secret_value())
            except ValueError:
                raise ValueError("QB2_ANCHOR_PRIVATE_KEY is not a valid key") from None
            if account.address.lower() != anchor.sender.lower():
                raise ValueError("QB2_ANCHOR_PRIVATE_KEY does not belong to QB2_ANCHOR_SENDER")
            anchor_service = ProvenanceAnchorService(
                EvmAnchorChain(anchor_chain, account, env, max_fee_wei=anchor.max_fee_gwei * 10**9),
                chain_id=anchor_chain.chain_id,
                sender=anchor.sender,
                max_batch=anchor.max_batch,
            )
    provenance_service = ProvenanceService(
        MongoProvenanceRepository(),
        storage_adapters=storage_adapters,
        anchor_adapters=anchor_adapters,
    )
    return create_app(
        settings,
        chain_registry=chain_registry,
        persistence_runtime=persistence_runtime,
        libp2p_plan=libp2p_plan,
        libp2p_runtime=libp2p_runtime,
        discovery_service=discovery_service,
        circuit_job_service=circuit_job_service,
        financial_job_service=financial_job_service,
        options_job_service=options_job_service,
        risk_job_service=risk_job_service,
        pharma_job_service=pharma_job_service,
        reservation_service=reservation_service,
        runtime_recovery_service=runtime_recovery_service,
        provenance_service=provenance_service,
        anchor_service=anchor_service,
        filecoin_service=filecoin_service,
    )
