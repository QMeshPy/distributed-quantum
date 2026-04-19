"""Configuration models for backend v2."""

from __future__ import annotations

from collections.abc import Mapping
from enum import Enum
from pathlib import Path
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field


def _default_peer_log_directory() -> Path:
    return Path("/tmp/quantum-backend-v2/peer-logs")


def _default_libp2p_peerstore_path() -> Path:
    return Path("/tmp/quantum-backend-v2/libp2p/peerstore.sqlite3")


class LoggingSettings(BaseModel):
    """Logging configuration."""

    model_config = ConfigDict(extra="forbid")

    level: str = Field(default="INFO", min_length=4)
    json_logs: bool = True


class PostgresTarget(str, Enum):
    """Supported Postgres deployment targets."""

    LOCAL = "local"
    NEON = "neon"


class MongoTarget(str, Enum):
    """Supported MongoDB deployment targets."""

    LOCAL = "local"
    REMOTE = "remote"


class PostgresSettings(BaseModel):
    """Transactional persistence configuration for local and Neon Postgres."""

    model_config = ConfigDict(extra="forbid")

    target: PostgresTarget = PostgresTarget.LOCAL
    local_dsn: str | None = Field(default=None, min_length=1)
    neon_pooled_dsn: str | None = Field(default=None, min_length=1)
    neon_direct_dsn: str | None = Field(default=None, min_length=1)
    database: str = Field(default="quantum_backend_v2", min_length=1)
    echo: bool = False
    pool_pre_ping: bool = True

    @property
    def configured(self) -> bool:
        return self.effective_app_dsn is not None

    @property
    def effective_app_dsn(self) -> str | None:
        if self.target == PostgresTarget.LOCAL:
            return self.local_dsn
        return self.neon_pooled_dsn or self.neon_direct_dsn

    @property
    def effective_migration_dsn(self) -> str | None:
        if self.target == PostgresTarget.LOCAL:
            return self.local_dsn
        return self.neon_direct_dsn or self.neon_pooled_dsn

    @property
    def resolved_database(self) -> str:
        dsn = self.effective_app_dsn or self.effective_migration_dsn
        if dsn is None:
            return self.database
        parsed = urlparse(dsn)
        database = parsed.path.lstrip("/")
        return database or self.database


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
    """Hybrid persistence settings for backend v2."""

    model_config = ConfigDict(extra="forbid")

    postgres: PostgresSettings = Field(default_factory=PostgresSettings)
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
    rendezvous_namespace: str = Field(default="quantum-backend-v2", min_length=3)
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


class AppSettings(BaseModel):
    """Top-level application settings."""

    model_config = ConfigDict(extra="forbid")

    environment: str = Field(default="development", min_length=1)
    service_name: str = Field(default="quantum-backend-v2", min_length=1)
    api_host: str = Field(default="0.0.0.0", min_length=1)
    api_port: int = Field(default=8081, ge=1, le=65535)
    auth_required: bool = Field(
        default=True,
        description=(
            "When False (QB2_AUTH_REQUIRED=false) all requests bypass authentication "
            "and are treated as a local dev-admin user. Never disable in production."
        ),
    )
    logging: LoggingSettings = Field(default_factory=LoggingSettings)
    persistence: PersistenceSettings = Field(default_factory=PersistenceSettings)
    libp2p: Libp2pSettings = Field(default_factory=Libp2pSettings)

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> "AppSettings":
        """Construct settings from a flat environment mapping."""
        return cls(
            environment=env.get("QB2_ENVIRONMENT", "development"),
            service_name=env.get("QB2_SERVICE_NAME", "quantum-backend-v2"),
            api_host=env.get("QB2_API_HOST", "0.0.0.0"),
            api_port=int(env.get("QB2_API_PORT", "8081")),
            auth_required=_parse_bool(env.get("QB2_AUTH_REQUIRED", "true")),
            logging=LoggingSettings(
                level=env.get("QB2_LOG_LEVEL", "INFO"),
                json_logs=_parse_bool(env.get("QB2_JSON_LOGS", "true")),
            ),
            persistence=PersistenceSettings(
                postgres=PostgresSettings(
                    target=PostgresTarget(env.get("QB2_POSTGRES_TARGET", "local")),
                    local_dsn=_optional(env.get("QB2_POSTGRES_LOCAL_DSN")),
                    neon_pooled_dsn=_optional(env.get("QB2_POSTGRES_NEON_POOLED_DSN")),
                    neon_direct_dsn=_optional(env.get("QB2_POSTGRES_NEON_DIRECT_DSN")),
                    database=env.get("QB2_POSTGRES_DATABASE", "quantum_backend_v2"),
                    echo=_parse_bool(env.get("QB2_POSTGRES_ECHO", "false")),
                    pool_pre_ping=_parse_bool(env.get("QB2_POSTGRES_POOL_PRE_PING", "true")),
                ),
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
                    "quantum-backend-v2",
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
