"""Configuration loading utilities."""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path

from dotenv import dotenv_values

from quantum_backend_v2.config.models import AppSettings


def load_settings(
    env: Mapping[str, str] | None = None,
    *,
    env_file: str | Path | None = None,
) -> AppSettings:
    """Load application settings from environment variables and a local .env file."""
    env_map: dict[str, str] = {}
    if env is None or env_file is not None:
        env_map.update(_load_env_file(env_file))
    env_map.update(os.environ if env is None else env)
    return AppSettings.from_env(env_map)


def _load_env_file(env_file: str | Path | None) -> dict[str, str]:
    path = Path(env_file) if env_file is not None else _default_env_file()
    if not path.exists():
        return {}
    return {
        key: value
        for key, value in dotenv_values(path).items()
        if value is not None
    }


def _default_env_file() -> Path:
    return Path(__file__).resolve().parents[3] / ".env"
