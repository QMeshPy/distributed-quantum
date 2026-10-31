"""Configuration loading utilities."""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path

from dotenv import dotenv_values

from quantum_backend_v2.config.models import AppSettings


def initialize_environment() -> None:
    """Hydrate legacy getenv readers from the same file as typed settings."""
    for key, value in _load_env_file(None).items():
        os.environ.setdefault(key, value)


def load_settings(
    env: Mapping[str, str] | None = None,
    *,
    env_file: str | Path | None = None,
) -> AppSettings:
    """Load application settings from environment variables and a local .env file."""
    return AppSettings.from_env(load_environment(env, env_file=env_file))


def load_environment(
    env: Mapping[str, str] | None = None, *, env_file: str | Path | None = None
) -> dict[str, str]:
    env_map: dict[str, str] = {}
    if env is None or env_file is not None:
        env_map.update(_load_env_file(env_file))
    env_map.update(os.environ if env is None else env)
    return env_map


def _load_env_file(env_file: str | Path | None) -> dict[str, str]:
    path = Path(env_file) if env_file is not None else _default_env_file()
    if not path.exists():
        return {}
    return {key: value for key, value in dotenv_values(path).items() if value is not None}


def _default_env_file() -> Path:
    source_root = Path(__file__).resolve().parents[3]
    # Source checkouts always use backend/.env; installed wheels use the launch directory.
    return (source_root if (source_root / "pyproject.toml").is_file() else Path.cwd()) / ".env"
