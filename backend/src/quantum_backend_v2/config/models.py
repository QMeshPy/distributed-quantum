"""Configuration models for backend v2."""

from __future__ import annotations

from collections.abc import Mapping
from decimal import Decimal
from enum import Enum
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator


def _default_peer_log_directory() -> Path:
    return Path("/tmp/quantum-backend/peer-logs")


def _default_libp2p_peerstore_path() -> Path:
    return Path("/tmp/quantum-backend/libp2p/peerstore.sqlite3")


class LoggingSettings(BaseModel):
    """Logging configuration."""

    model_config = ConfigDict(extra="forbid")

    level: str = Field(default="INFO", min_length=4)
    json_logs: bool = True


class MongoTarget(str, Enum):
    """Supported MongoDB deployment targets."""

    LOCAL = "local"
    REMOTE = "remote"


class MongoSettings(BaseModel):
    """Projection and document-store configuration for local and remote MongoDB."""

    model_config = ConfigDict(extra="forbid")

    target: MongoTarget = MongoTarget.LOCAL
    local_uri: str | None = Field(default=None, min_length=1)
    remote_uri: str | None = Field(default=None, min_length=1)
    database: str = Field(default="quantum_backend_v2", min_length=1)
    server_selection_timeout_ms: int = Field(default=5000, ge=100)

    @property
    def configured(self) -> bool:
        return self.effective_uri is not None

    @property
    def effective_uri(self) -> str | None:
        if self.target == MongoTarget.LOCAL:
            return self.local_uri
        return self.remote_uri


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


class WorkerPayoutSettings(BaseModel):
    """Pay-per-fragment worker payouts (#8)."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    # Fragments below this observed fidelity are not paid.
    min_fidelity: float = Field(default=0.0, ge=0, le=1, allow_inf_nan=False)
    # Platform-managed wallet that sends payouts. Unset: intents accrue, nothing is sent.
    wallet_address: str | None = Field(default=None, pattern=r"^0x[0-9a-fA-F]{40}$")
    # A worker is paid once their accrued total reaches the threshold or their
    # oldest unpaid fragment reaches the maximum age, so tiny payouts wait.
    threshold: Decimal = Field(default=Decimal("1"), gt=0)
    max_age_seconds: int = Field(default=86_400, gt=0)
    # How often the settler runs; 0 turns it off.
    interval_seconds: int = Field(default=300, ge=0)


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
    worker_payouts: WorkerPayoutSettings = Field(default_factory=WorkerPayoutSettings)
    logging: LoggingSettings = Field(default_factory=LoggingSettings)
    persistence: PersistenceSettings = Field(default_factory=PersistenceSettings)
    libp2p: Libp2pSettings = Field(default_factory=Libp2pSettings)
    kubo: KuboSettings = Field(default_factory=KuboSettings)
    gateway: GatewaySettings = Field(default_factory=GatewaySettings)

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> AppSettings:
        """Construct settings from a flat environment mapping."""
        registry_path = _optional(env.get("QB2_CHAIN_REGISTRY_PATH"))
        return cls(
            environment=env.get("QB2_ENVIRONMENT", "development"),
            service_name=env.get("QB2_SERVICE_NAME", "quantum-backend"),
            api_host=env.get("QB2_API_HOST", "0.0.0.0"),
            api_port=int(env.get("QB2_API_PORT", "8081")),
            chain_registry_path=Path(registry_path) if registry_path is not None else None,
            wallet_network=env.get("NETWORK"),
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
            worker_payouts=WorkerPayoutSettings.model_validate(
                {
                    "min_fidelity": env.get("QB2_WORKER_PAYOUT_MIN_FIDELITY", "0"),
                    "wallet_address": _optional(env.get("QB2_WORKER_PAYOUT_WALLET")),
                    "threshold": env.get("QB2_WORKER_PAYOUT_THRESHOLD", "1"),
                    "max_age_seconds": env.get("QB2_WORKER_PAYOUT_MAX_AGE_SECONDS", "86400"),
                    "interval_seconds": env.get("QB2_WORKER_PAYOUT_INTERVAL_SECONDS", "300"),
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
            logging=LoggingSettings(
                level=env.get("QB2_LOG_LEVEL", "INFO"),
                json_logs=_parse_bool(env.get("QB2_JSON_LOGS", "true")),
            ),
            persistence=PersistenceSettings(
                mongodb=MongoSettings(
                    target=MongoTarget(env.get("QB2_MONGODB_TARGET", "local")),
                    local_uri=_optional(env.get("QB2_MONGODB_LOCAL_URI")),
                    remote_uri=_optional(env.get("QB2_MONGODB_REMOTE_URI")),
                    database=env.get("QB2_MONGODB_DATABASE", "quantum_backend_v2"),
                    server_selection_timeout_ms=int(
                        env.get("QB2_MONGODB_SERVER_SELECTION_TIMEOUT_MS", "5000")
                    ),
                ),
                peer_log=PeerLogSettings(
                    directory=Path(
                        env.get(
                            "QB2_PEER_LOG_DIR",
                            str(_default_peer_log_directory()),
                        )
                    ),
                    peer_id=env.get("QB2_PEER_ID", "local-dev-peer"),
                    fsync=_parse_bool(env.get("QB2_PEER_LOG_FSYNC", "true")),
                ),
            ),
            libp2p=Libp2pSettings(
                enabled=_parse_bool(env.get("QB2_LIBP2P_ENABLED", "true")),
                peer_id=env.get("QB2_LIBP2P_PEER_ID", "qb2-dev-peer"),
                listen_multiaddrs=_parse_csv(
                    env.get("QB2_LIBP2P_LISTEN_MULTIADDRS", "/ip4/0.0.0.0/tcp/4011")
                ),
                advertise_multiaddrs=_parse_csv(env.get("QB2_LIBP2P_ADVERTISE_MULTIADDRS", "")),
                bootstrap_peers=_parse_csv(env.get("QB2_LIBP2P_BOOTSTRAP_PEERS", "")),
                rendezvous_namespace=env.get(
                    "QB2_LIBP2P_RENDEZVOUS_NAMESPACE",
                    "quantum-backend",
                ),
                peerstore_path=Path(
                    env.get(
                        "QB2_LIBP2P_PEERSTORE_PATH",
                        str(_default_libp2p_peerstore_path()),
                    )
                ),
                activate_listeners=_parse_bool(env.get("QB2_LIBP2P_ACTIVATE_LISTENERS", "true")),
                heartbeat_interval_seconds=int(
                    env.get("QB2_LIBP2P_HEARTBEAT_INTERVAL_SECONDS", "60")
                ),
                stale_peer_ttl_seconds=int(env.get("QB2_LIBP2P_STALE_PEER_TTL_SECONDS", "300")),
                dev_service_peer_count=int(env.get("QB2_LIBP2P_DEV_SERVICE_PEER_COUNT", "0")),
                dev_service_base_port=int(env.get("QB2_LIBP2P_DEV_SERVICE_BASE_PORT", "4021")),
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
