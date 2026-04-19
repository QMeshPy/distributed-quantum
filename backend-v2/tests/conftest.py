"""Pytest shared fixtures for backend v2."""

from __future__ import annotations

import pytest


@pytest.fixture
def anyio_backend() -> str:
    """Use a deterministic AnyIO backend for all async tests."""
    return "asyncio"
