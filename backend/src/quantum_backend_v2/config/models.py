"""Configuration models for backend v2."""

from __future__ import annotations

from collections.abc import Mapping
from decimal import Decimal
from enum import Enum
from pathlib import Path
from typing import Annotated
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator

from quantum_backend_v2.config import constants as C


def _default_peer_log_directory() -> Path:
    return Path("/tmp/quantum-backend/peer-logs")


def _default_libp2p_peerstore_path() -> Path:
    return Path("/tmp/quantum-backend/libp2p/peerstore.sqlite3")


class LoggingSettings(BaseModel):
    """Logging configuration."""

    model_config = ConfigDict(extra="forbid")

    level: str = Field(default="INFO", min_length=4)
    json_logs: bool = True


class MongoSettings(BaseModel):
    """Projection and document-store configuration for MongoDB (local or hosted)."""

    model_config = ConfigDict(extra="forbid")

    uri: str | None = Field(default=None, min_length=1)
    database: str = Field(default="quantum_backend_v2", min_length=1)
    server_selection_timeout_ms: int = Field(default=5000, ge=100)

    @property
    def configured(self) -> bool:
        return self.uri is not None


class PeerLogSettings(BaseModel):
    """Durable local peer log configuration."""

    model_config = ConfigDict(extra="forbid")

    directory: Path = Field(default_factory=_default_peer_log_directory)
    peer_id: str = Field(default="local-dev-peer", min_length=1)
    fsync: bool = True


class PersistenceSettings(BaseModel):
    """Persistence settings for backend v2."""

    model_config = ConfigDict(extra="forbid")

    mongodb: MongoSettings = Field(default_factory=MongoSettings)
    peer_log: PeerLogSettings = Field(default_factory=PeerLogSettings)


class Libp2pSettings(BaseModel):
    """Runtime settings for the libp2p peer host."""

    model_config = ConfigDict(extra="forbid")

    enabled: bool = True
    peer_id: str = Field(default="qb2-dev-peer", min_length=3)
    listen_multiaddrs: tuple[str, ...] = Field(default_factory=tuple)
    advertise_multiaddrs: tuple[str, ...] = Field(default_factory=tuple)
    bootstrap_peers: tuple[str, ...] = Field(default_factory=tuple)
    rendezvous_namespace: str = Field(default="quantum-backend", min_length=3)
    peerstore_path: Path = Field(default_factory=_default_libp2p_peerstore_path)
    activate_listeners: bool = True
    heartbeat_interval_seconds: int = Field(default=60, ge=5)
    stale_peer_ttl_seconds: int = Field(default=300, ge=30)
    dev_service_peer_count: int = Field(default=0, ge=0, le=32)
    dev_service_base_port: int = Field(default=4021, ge=1024, le=65535)

    @property
    def advertisement_topic(self) -> str:
        return f"{self.rendezvous_namespace}.peer-advertisement.v1"

    @property
    def heartbeat_topic(self) -> str:
        return f"{self.rendezvous_namespace}.peer-heartbeat.v1"


class KuboSettings(BaseModel):
    """Optional content RPC configuration; readiness is checked only by its client."""

    model_config = ConfigDict(extra="forbid", frozen=True, hide_input_in_errors=True)

    rpc_url: str = Field(default="http://kubo:5001", repr=False)
    rpc_secret: SecretStr | None = Field(default=None, repr=False)
    timeout_seconds: float = Field(default=30, gt=0, le=300, allow_inf_nan=False)
    max_response_bytes: int = Field(default=4 * 1024 * 1024, gt=0, le=64 * 1024 * 1024)


class AnchorSettings(BaseModel):
    """Provenance anchoring (#21); off unless a registry network is configured."""

    model_config = ConfigDict(extra="forbid", frozen=True, hide_input_in_errors=True)

    # Registry alias or CAIP-2 ID of an entry with the anchor_root capability.
    network: str | None = Field(default=None, min_length=1)
    # Public anchor account; verifiers check transactions come from it.
    sender: str | None = Field(default=None, pattern=r"^0x[0-9a-fA-F]{40}$")
    # Earlier anchor accounts, so anchors sent before a key rotation keep verifying.
    past_senders: tuple[Annotated[str, Field(pattern=r"^0x[0-9a-fA-F]{40}$")], ...] = ()
    # Dedicated low-balance key that sends anchors; without it this node only verifies.
    private_key: SecretStr | None = Field(default=None, repr=False)
    interval_seconds: int = Field(default=3600, ge=60, le=7 * 86400)
    # One batch document lists every bundle, so stay far below MongoDB's 16 MB limit.
    max_batch: int = Field(default=10_000, ge=1, le=20_000)
    # Skip a run instead of paying more than this per gas unit.
    max_fee_gwei: int = Field(default=100, ge=1, le=10_000)

    @model_validator(mode="after")
    def _sender_with_network(self) -> AnchorSettings:
        if self.network is not None and self.sender is None:
            raise ValueError("QB2_ANCHOR_SENDER is required with QB2_ANCHOR_NETWORK")
        if self.private_key is not None and self.network is None:
            raise ValueError("QB2_ANCHOR_NETWORK is required with QB2_ANCHOR_PRIVATE_KEY")
        return self


class GatewaySettings(BaseModel):
    """Bounded, read-only access to an operator-configured IPFS gateway."""

    model_config = ConfigDict(extra="forbid", frozen=True, hide_input_in_errors=True)

    url: str = Field(default="http://kubo:8080", repr=False)
    # Where browsers reach the gateway; evidence links on the run page use it.
    public_url: str | None = None
    timeout_seconds: float = Field(default=30, gt=0, le=300, allow_inf_nan=False)
    max_response_bytes: int = Field(default=4 * 1024 * 1024, gt=0, le=64 * 1024 * 1024)

    @field_validator("public_url")
    @classmethod
    def _public_origin(cls, value: str | None) -> str | None:
        if value is None:
            return None
        parts = urlsplit(value)
        if (
            parts.scheme not in {"http", "https"}
            or not parts.hostname
            or parts.username
            or parts.password
            or parts.query
            or parts.fragment
            or parts.path not in {"", "/"}
            or any(character.isspace() for character in value)
        ):
            raise ValueError("Public gateway URL must be a bare http(s) origin")
        return f"{parts.scheme}://{parts.netloc}"


class AppSettings(BaseModel):
    """Top-level application settings."""

    model_config = ConfigDict(extra="forbid")

    environment: str = Field(default="development", min_length=1)
    service_name: str = Field(default="quantum-backend", min_length=1)
    api_host: str = Field(default="0.0.0.0", min_length=1)
    api_port: int = Field(default=8081, ge=1, le=65535)
    chain_registry_path: Path | None = None
    wallet_network: str | None = None
    auth_required: bool = Field(
        default=True,
        description=(
            "When False (QB2_AUTH_REQUIRED=false) all requests bypass authentication "
            "and are treated as a local dev-admin user. Never disable in production."
        ),
    )
    allow_dev_bearer_tokens: bool = Field(
        default=False,
        description=(
            "When True, auth-enabled environments may accept development bearer tokens "
            "in the form 'Bearer dev-<user_id>'. Keep disabled outside controlled local testing."
        ),
    )
    x402_gateway_secret: str | None = Field(default=None, min_length=16)
    billing_internal_secret: str | None = Field(
        default=None,
        min_length=32,
        description="Shared with the frontend's Stripe webhook to record credit purchases.",
    )
    circuit_job_credit_cost: Decimal = Field(
        default=Decimal("0"),
        ge=0,
        description="Credits charged per circuit job. 0 turns credit metering off.",
    )
    logging: LoggingSettings = Field(default_factory=LoggingSettings)
    persistence: PersistenceSettings = Field(default_factory=PersistenceSettings)
    libp2p: Libp2pSettings = Field(default_factory=Libp2pSettings)
    kubo: KuboSettings = Field(default_factory=KuboSettings)
    gateway: GatewaySettings = Field(default_factory=GatewaySettings)
    anchor: AnchorSettings = Field(default_factory=AnchorSettings)

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> AppSettings:
        """Construct settings from a flat environment mapping."""
        registry_path = _optional(env.get("QB2_CHAIN_REGISTRY_PATH"))
        return cls(
            environment=env.get("QB2_ENVIRONMENT", "development"),
            service_name=env.get("QB2_SERVICE_NAME", C.SERVICE_NAME),
            api_host=env.get("QB2_API_HOST", C.API_HOST),
            api_port=int(env.get("QB2_API_PORT", str(C.API_PORT))),
            chain_registry_path=Path(registry_path) if registry_path is not None else None,
            wallet_network=env.get("NETWORK", C.WALLET_NETWORK),
            auth_required=_parse_bool(env.get("QB2_AUTH_REQUIRED", "true")),
            allow_dev_bearer_tokens=_parse_bool(env.get("QB2_ALLOW_DEV_BEARER_TOKENS", "false")),
            x402_gateway_secret=_optional(env.get("QB2_X402_GATEWAY_SECRET")),
            billing_internal_secret=_optional(env.get("QB2_BILLING_INTERNAL_SECRET")),
            circuit_job_credit_cost=Decimal(env.get("QB2_CIRCUIT_JOB_CREDIT_COST", "0")),
            # Reuse the deployment's KUBO_* names rather than a second credential alias.
            kubo=KuboSettings.model_validate(
                {
                    "rpc_url": env.get("KUBO_RPC_URL") or "http://kubo:5001",
                    "rpc_secret": env.get("KUBO_RPC_SECRET") or None,
                    "timeout_seconds": env.get("KUBO_RPC_TIMEOUT_SECONDS", "30"),
                    "max_response_bytes": env.get("KUBO_RPC_MAX_RESPONSE_BYTES", "4194304"),
                }
            ),
            gateway=GatewaySettings.model_validate(
                {
                    "url": env.get("IPFS_GATEWAY_URL", "http://kubo:8080"),
                    "public_url": env.get("IPFS_PUBLIC_GATEWAY_URL") or None,
                    "timeout_seconds": env.get("IPFS_GATEWAY_TIMEOUT_SECONDS", "30"),
                    "max_response_bytes": env.get("IPFS_GATEWAY_MAX_RESPONSE_BYTES", "4194304"),
                }
            ),
            anchor=AnchorSettings.model_validate(
                {
                    "network": _optional(env.get("QB2_ANCHOR_NETWORK")),
                    "sender": _optional(env.get("QB2_ANCHOR_SENDER")),
                    "past_senders": tuple(
                        item.strip()
                        for item in env.get("QB2_ANCHOR_PAST_SENDERS", "").split(",")
                        if item.strip()
                    ),
                    "private_key": _optional(env.get("QB2_ANCHOR_PRIVATE_KEY")),
                    "interval_seconds": env.get("QB2_ANCHOR_INTERVAL_SECONDS", "3600"),
                    "max_batch": env.get("QB2_ANCHOR_MAX_BATCH", "10000"),
                    "max_fee_gwei": env.get("QB2_ANCHOR_MAX_FEE_GWEI", "100"),
                }
            ),
            logging=LoggingSettings(
                level=env.get("QB2_LOG_LEVEL", C.LOG_LEVEL),
                json_logs=_parse_bool(env.get("QB2_JSON_LOGS", str(C.JSON_LOGS))),
            ),
            persistence=PersistenceSettings(
                mongodb=MongoSettings(
                    uri=_optional(env.get("QB2_MONGODB_URI")),
                    database=env.get("QB2_MONGODB_DATABASE", C.MONGODB_DATABASE),
                    server_selection_timeout_ms=int(
                        env.get(
                            "QB2_MONGODB_SERVER_SELECTION_TIMEOUT_MS",
                            str(C.MONGODB_SERVER_SELECTION_TIMEOUT_MS),
                        )
                    ),
                ),
                peer_log=PeerLogSettings(
                    directory=Path(
                        env.get("QB2_PEER_LOG_DIR", C.PEER_LOG_DIR)
                    ),
                    peer_id=env.get("QB2_PEER_ID", C.PEER_ID),
                    fsync=_parse_bool(env.get("QB2_PEER_LOG_FSYNC", str(C.PEER_LOG_FSYNC))),
                ),
            ),
            libp2p=Libp2pSettings(
                enabled=_parse_bool(env.get("QB2_LIBP2P_ENABLED", str(C.LIBP2P_ENABLED))),
                peer_id=env.get("QB2_LIBP2P_PEER_ID", C.LIBP2P_PEER_ID),
                listen_multiaddrs=_parse_csv(
                    env.get("QB2_LIBP2P_LISTEN_MULTIADDRS", C.LIBP2P_LISTEN_MULTIADDRS)
                ),
                advertise_multiaddrs=_parse_csv(env.get("QB2_LIBP2P_ADVERTISE_MULTIADDRS", C.LIBP2P_ADVERTISE_MULTIADDRS)),
                bootstrap_peers=_parse_csv(env.get("QB2_LIBP2P_BOOTSTRAP_PEERS", C.LIBP2P_BOOTSTRAP_PEERS)),
                rendezvous_namespace=env.get(
                    "QB2_LIBP2P_RENDEZVOUS_NAMESPACE",
                    C.LIBP2P_RENDEZVOUS_NAMESPACE,
                ),
                peerstore_path=Path(
                    env.get("QB2_LIBP2P_PEERSTORE_PATH", C.LIBP2P_PEERSTORE_PATH)
                ),
                activate_listeners=_parse_bool(
                    env.get("QB2_LIBP2P_ACTIVATE_LISTENERS", str(C.LIBP2P_ACTIVATE_LISTENERS))
                ),
                heartbeat_interval_seconds=int(
                    env.get(
                        "QB2_LIBP2P_HEARTBEAT_INTERVAL_SECONDS",
                        str(C.LIBP2P_HEARTBEAT_INTERVAL_SECONDS),
                    )
                ),
                stale_peer_ttl_seconds=int(env.get(
                        "QB2_LIBP2P_STALE_PEER_TTL_SECONDS", str(C.LIBP2P_STALE_PEER_TTL_SECONDS)
                    )),
                dev_service_peer_count=int(env.get("QB2_LIBP2P_DEV_SERVICE_PEER_COUNT", "0")),
                dev_service_base_port=int(env.get("QB2_LIBP2P_DEV_SERVICE_BASE_PORT", str(C.LIBP2P_DEV_SERVICE_BASE_PORT))),
            ),
        )


def _parse_bool(value: str) -> bool:
    normalized = value.strip().lower()
    return normalized in {"1", "true", "yes", "on"}


def _parse_csv(value: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in value.split(",") if item.strip())


def _optional(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None
