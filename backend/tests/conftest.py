"""Pytest shared fixtures."""

from __future__ import annotations

import pytest


@pytest.fixture
def anyio_backend() -> str:
    """Use a single deterministic backend for all AnyIO tests."""
    return "asyncio"
