"""Stable, machine-readable error contracts for the platform API."""

from __future__ import annotations

import logging
from enum import Enum
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)


class ErrorCode(str, Enum):
    """Machine-readable error codes returned by all platform endpoints."""

    NOT_FOUND = "not_found"
    CONFLICT = "conflict"
    VALIDATION_ERROR = "validation_error"
    UNAUTHORIZED = "unauthorized"
    FORBIDDEN = "forbidden"
    RATE_LIMITED = "rate_limited"
    INTERNAL_ERROR = "internal_error"
    SERVICE_UNAVAILABLE = "service_unavailable"
    RESOURCE_EXHAUSTED = "resource_exhausted"
    IDEMPOTENCY_CONFLICT = "idempotency_conflict"
    INSUFFICIENT_CREDITS = "insufficient_credits"


class ErrorDetail(BaseModel):
    """Single field-level or domain-level error detail."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    field: str | None = Field(default=None, description="Dotted field path if applicable.")
    message: str = Field(min_length=1)
    code: str | None = None


class ApiError(BaseModel):
    """Top-level error envelope returned on all error responses."""

    model_config = ConfigDict(extra="forbid")

    error: ErrorCode
    message: str = Field(min_length=1)
    details: list[ErrorDetail] = Field(default_factory=list)
    request_id: str | None = None
    docs_url: str | None = None

    @classmethod
    def not_found(cls, message: str, *, request_id: str | None = None) -> "ApiError":
        return cls(error=ErrorCode.NOT_FOUND, message=message, request_id=request_id)

    @classmethod
    def conflict(cls, message: str, *, request_id: str | None = None) -> "ApiError":
        return cls(error=ErrorCode.CONFLICT, message=message, request_id=request_id)

    @classmethod
    def forbidden(cls, message: str, *, request_id: str | None = None) -> "ApiError":
        return cls(error=ErrorCode.FORBIDDEN, message=message, request_id=request_id)

    @classmethod
    def unauthorized(cls, message: str = "Authentication required.") -> "ApiError":
        return cls(error=ErrorCode.UNAUTHORIZED, message=message)

    @classmethod
    def internal(cls, message: str = "An unexpected error occurred.") -> "ApiError":
        return cls(error=ErrorCode.INTERNAL_ERROR, message=message)


class PlatformException(Exception):
    """Raised by application code to produce a typed API error response."""

    def __init__(
        self,
        *,
        status_code: int,
        error: ErrorCode,
        message: str,
        details: list[ErrorDetail] | None = None,
    ) -> None:
        self.status_code = status_code
        self.api_error = ApiError(
            error=error,
            message=message,
            details=details or [],
        )
        super().__init__(message)


def register_exception_handlers(app: FastAPI) -> None:
    """Attach shared exception handlers to the FastAPI application."""

    @app.exception_handler(PlatformException)
    async def _platform_exception(request: Request, exc: PlatformException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=exc.api_error.model_dump(mode="json"),
        )

    @app.exception_handler(Exception)
    async def _unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
        # Exception messages, URL parameters, and query strings can contain credentials.
        route = getattr(request.scope.get("route"), "path", "<unmatched>")
        logger.error("Unhandled %s during %s %s", type(exc).__name__, request.method, route)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ApiError.internal().model_dump(mode="json"),
        )


def not_found(resource: str, identifier: Any) -> PlatformException:
    return PlatformException(
        status_code=status.HTTP_404_NOT_FOUND,
        error=ErrorCode.NOT_FOUND,
        message=f"{resource} '{identifier}' was not found.",
    )


def conflict(message: str) -> PlatformException:
    return PlatformException(
        status_code=status.HTTP_409_CONFLICT,
        error=ErrorCode.CONFLICT,
        message=message,
    )


def forbidden(message: str) -> PlatformException:
    return PlatformException(
        status_code=status.HTTP_403_FORBIDDEN,
        error=ErrorCode.FORBIDDEN,
        message=message,
    )
