"""Application configuration models."""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field


def default_database_path() -> str:
    """Stable default DB path when running from a source checkout.

    If this package lives under a ``src/`` tree (typical editable install), use
    ``<repo>/backend/data/quantum_coordinator.db`` regardless of process cwd so
    submit/list/detail always share one database. Otherwise keep cwd-relative
    ``./data/quantum_coordinator.db`` (e.g. wheel install).
    """
    package_dir = Path(__file__).resolve().parent.parent
    parent = package_dir.parent
    if parent.name == "src":
        backend_root = parent.parent
        return str((backend_root / "data" / "quantum_coordinator.db").resolve())
    return "./data/quantum_coordinator.db"


class APIConfig(BaseModel):
    """HTTP API settings."""

    model_config = ConfigDict(extra="forbid")

    host: str = Field(default="0.0.0.0", min_length=1)
    port: int = Field(default=8080, ge=1, le=65535)
    enable_cors: bool = True
    cors_origins: list[str] = Field(default_factory=lambda: ["*"])
    max_request_bytes: int = Field(default=1_000_000, ge=1024)
    enable_auth: bool = False
    api_key: str | None = Field(default=None, min_length=1)
    enable_rate_limit: bool = False
    rate_limit_per_minute: int = Field(default=60, ge=1)


class LoggingConfig(BaseModel):
    """Structured logging settings."""

    model_config = ConfigDict(extra="forbid")

    level: str = Field(default="INFO", min_length=4)
    json_logs: bool = True
    service_name: str = Field(default="quantum-coordinator", min_length=1)


class DatabaseConfig(BaseModel):
    """SQLite settings."""

    model_config = ConfigDict(extra="forbid")

    path: str = Field(default_factory=default_database_path, min_length=1)
    enable_wal_mode: bool = True


class DiscoveryConfig(BaseModel):
    """Discovery refresh and staleness thresholds."""

    model_config = ConfigDict(extra="forbid")

    refresh_interval_seconds: int = Field(default=30, ge=1)
    stale_timeout_seconds: int = Field(default=120, ge=1)
    service_ad_topic: str = Field(default="/quantum-coordinator/service-ads/v1", min_length=1)


class RuntimeConfig(BaseModel):
    """Runtime retry and timeout settings."""

    model_config = ConfigDict(extra="forbid")

    max_retries: int = Field(default=3, ge=0)
    base_timeout_seconds: float = Field(default=5.0, gt=0)
    backoff_multiplier: float = Field(default=2.0, ge=1.0)


class Libp2pConfig(BaseModel):
    """Real py-libp2p transport settings."""

    model_config = ConfigDict(extra="forbid")

    enabled: bool = True
    enable_mdns: bool = False
    coordinator_listen_addrs: tuple[str, ...] = ("/ip4/127.0.0.1/tcp/9100",)
    gate_protocol_id: str = Field(
        default="/quantum-coordinator/gate-exec/1.0.0",
        min_length=1,
    )
    embedded_service_count: int = Field(default=3, ge=1, le=10)
    embedded_service_base_port: int = Field(default=9200, ge=1024, le=65535)
    embedded_ad_interval_seconds: float = Field(default=5.0, gt=0.1, le=60.0)


class AppConfig(BaseModel):
    """Top-level app configuration."""

    model_config = ConfigDict(extra="forbid")

    environment: str = Field(default="development", min_length=1)
    recover_jobs_on_startup: bool = Field(
        default=True,
        description="When true, unfinished jobs are resumed after coordinator startup.",
    )
    api: APIConfig = Field(default_factory=APIConfig)
    logging: LoggingConfig = Field(default_factory=LoggingConfig)
    database: DatabaseConfig = Field(default_factory=DatabaseConfig)
    discovery: DiscoveryConfig = Field(default_factory=DiscoveryConfig)
    runtime: RuntimeConfig = Field(default_factory=RuntimeConfig)
    libp2p: Libp2pConfig = Field(default_factory=Libp2pConfig)
