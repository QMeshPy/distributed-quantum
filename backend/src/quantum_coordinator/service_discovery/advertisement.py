"""Service advertisement schema and validation."""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from quantum_coordinator.domain.models import GateType

SUPPORTED_PROTOCOL_VERSION = "1.0"


class ServiceAdvertisement(BaseModel):
    """Validated advertisement sent by service nodes."""

    model_config = ConfigDict(extra="forbid")

    protocol_version: str = Field(default=SUPPORTED_PROTOCOL_VERSION)
    node_id: str = Field(min_length=1)
    listen_addrs: tuple[str, ...] = Field(default_factory=tuple)
    service_type: GateType
    fidelity: float = Field(ge=0.0, le=1.0)
    qubit_min: int = Field(ge=1)
    qubit_max: int = Field(ge=1)
    availability: bool = True
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @model_validator(mode="after")
    def validate_ranges_and_version(self) -> ServiceAdvertisement:
        """Validate qubit range and protocol compatibility."""
        if self.protocol_version != SUPPORTED_PROTOCOL_VERSION:
            raise ValueError(
                f"Unsupported protocol version {self.protocol_version!r}; "
                f"expected {SUPPORTED_PROTOCOL_VERSION!r}"
            )
        if self.qubit_max < self.qubit_min:
            raise ValueError("qubit_max must be >= qubit_min")
        return self

    def to_wire_bytes(self) -> bytes:
        """Serialize to UTF-8 JSON bytes for pubsub transport."""
        return self.model_dump_json().encode("utf-8")

    @classmethod
    def from_wire_bytes(cls, raw: bytes) -> ServiceAdvertisement:
        """Deserialize and validate an advertisement from pubsub bytes."""
        return cls.model_validate_json(raw)


def validate_advertisement_payload(raw: bytes) -> tuple[ServiceAdvertisement | None, str | None]:
    """Validate incoming advertisement bytes and return parse result + error."""
    try:
        return ServiceAdvertisement.from_wire_bytes(raw), None
    except ValidationError as exc:
        return None, str(exc)
