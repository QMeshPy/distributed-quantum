"""Peer-published service package manifest models."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from quantum_backend_v2.protocols import ProtocolDescriptor


class RuntimeClass(str, Enum):
    """Supported execution sandboxes for peer-published services."""

    BUILTIN = "builtin"
    WASM = "wasm"
    CONTAINER = "container"
    PYTHON_ENV = "python_env"


class ServiceVisibility(str, Enum):
    """Visibility and distribution scope for a published service."""

    PRIVATE = "private"
    ORGANIZATION = "organization"
    NETWORK_PUBLIC = "network_public"


class BenchmarkMode(str, Enum):
    """Benchmark posture for a published service."""

    QUANTUM_ONLY = "quantum_only"
    CLASSICAL_ONLY = "classical_only"
    QUANTUM_VS_CLASSICAL = "quantum_vs_classical"


class ServiceInterfaceSchema(BaseModel):
    """Typed interface schema for a service package."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str = Field(min_length=1)
    json_schema: dict[str, Any] = Field(default_factory=dict)


class PackageIntegrity(BaseModel):
    """Integrity metadata for a package payload."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    algorithm: str = Field(default="sha256", min_length=3)
    digest: str = Field(min_length=32)
    manifest_signature: str = Field(min_length=16)


class BenchmarkMetadata(BaseModel):
    """Benchmark metadata attached to a publishable service."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    mode: BenchmarkMode
    benchmark_family: str = Field(min_length=3)
    comparable_output_schema: bool = True
    notes: str | None = Field(default=None, max_length=600)


class PeerPublishedQuantumServiceManifest(BaseModel):
    """Portable, signed manifest for a peer-published quantum service."""

    model_config = ConfigDict(extra="forbid")

    service_id: str = Field(min_length=2)
    version: str = Field(min_length=3)
    title: str = Field(min_length=3, max_length=120)
    summary: str = Field(min_length=12, max_length=600)
    publisher_peer_id: str = Field(min_length=3)
    publisher_account_id: str | None = Field(default=None, min_length=3)
    runtime_class: RuntimeClass
    protocol: ProtocolDescriptor
    quantum_capability: str = Field(min_length=2)
    classical_baseline_capability: str | None = Field(default=None, min_length=2)
    entrypoint: str = Field(min_length=1)
    tags: tuple[str, ...] = Field(default_factory=tuple)
    input_schema: ServiceInterfaceSchema
    output_schema: ServiceInterfaceSchema
    benchmark: BenchmarkMetadata
    integrity: PackageIntegrity
    visibility: ServiceVisibility = ServiceVisibility.PRIVATE
    supported_architectures: tuple[str, ...] = Field(default_factory=tuple)
    min_memory_mb: int = Field(default=256, ge=64)
    min_cpu_cores: int = Field(default=1, ge=1)
    requires_gpu: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        normalized = tuple(tag.strip().lower() for tag in value if tag.strip())
        if len(set(normalized)) != len(normalized):
            raise ValueError("tags must be unique after normalization")
        return normalized

    @field_validator("supported_architectures")
    @classmethod
    def normalize_architectures(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        return tuple(arch.strip().lower() for arch in value if arch.strip())

    @model_validator(mode="after")
    def validate_benchmark_requirements(self) -> "PeerPublishedQuantumServiceManifest":
        if (
            self.benchmark.mode == BenchmarkMode.QUANTUM_VS_CLASSICAL
            and self.classical_baseline_capability is None
        ):
            raise ValueError(
                "quantum_vs_classical services must declare a classical_baseline_capability"
            )
        if (
            self.benchmark.mode == BenchmarkMode.CLASSICAL_ONLY
            and self.classical_baseline_capability is None
        ):
            raise ValueError("classical_only services must declare a classical_baseline_capability")
        return self
