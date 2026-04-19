"""Core protocol descriptors for backend v2."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ProtocolVersion(BaseModel):
    """Semantic version for a wire protocol."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    major: int = Field(ge=0)
    minor: int = Field(ge=0)
    patch: int = Field(ge=0)

    def as_tag(self) -> str:
        """Render a semantic version tag."""
        return f"v{self.major}.{self.minor}.{self.patch}"


class ProtocolDescriptor(BaseModel):
    """Descriptor for a libp2p-exposed protocol or pubsub topic."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str = Field(min_length=3)
    version: ProtocolVersion
    stream_id: str | None = Field(default=None, min_length=3)
    topic: str | None = Field(default=None, min_length=3)
    description: str | None = Field(default=None, max_length=400)

    @model_validator(mode="after")
    def validate_addressability(self) -> "ProtocolDescriptor":
        if self.stream_id is None and self.topic is None:
            raise ValueError("protocol descriptor must define a stream_id or topic")
        return self
