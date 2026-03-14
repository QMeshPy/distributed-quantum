"""Configuration loading with file + environment override support."""

from __future__ import annotations

import json
import os
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import tomli
import yaml
from pydantic import ValidationError

from quantum_coordinator.config.models import AppConfig

ENV_PREFIX = "QC_"
CONFIG_PATH_ENV = "QC_CONFIG_FILE"


class ConfigError(ValueError):
    """Raised when configuration cannot be loaded or validated."""


def load_config(path: str | Path | None = None, env: Mapping[str, str] | None = None) -> AppConfig:
    """Load configuration from an optional file and environment overrides."""
    env_map = dict(os.environ if env is None else env)

    resolved_path: Path | None = None
    if path is not None:
        resolved_path = Path(path)
    elif CONFIG_PATH_ENV in env_map:
        resolved_path = Path(env_map[CONFIG_PATH_ENV])

    raw: dict[str, Any] = {}
    if resolved_path is not None:
        raw = _load_file_config(resolved_path)

    _apply_env_overrides(raw, env_map)

    try:
        return AppConfig.model_validate(raw)
    except ValidationError as exc:  # pragma: no cover - error text validated in tests
        raise ConfigError(f"Invalid configuration: {exc}") from exc


def _load_file_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise ConfigError(f"Config file not found: {path}")

    suffix = path.suffix.lower()
    if suffix in {".yaml", ".yml"}:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    elif suffix == ".toml":
        with path.open("rb") as handle:
            data = tomli.load(handle)
    else:
        raise ConfigError(f"Unsupported config extension: {suffix}")

    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ConfigError("Top-level config must be a mapping")

    return data


def _apply_env_overrides(raw: dict[str, Any], env_map: Mapping[str, str]) -> None:
    for key, value in env_map.items():
        if not key.startswith(ENV_PREFIX):
            continue
        if key == CONFIG_PATH_ENV:
            continue

        path_parts = key[len(ENV_PREFIX) :].lower().split("__")
        if not path_parts or any(part == "" for part in path_parts):
            continue
        _set_path(raw, path_parts, _coerce_env_value(value))


def _set_path(raw: dict[str, Any], path_parts: list[str], value: Any) -> None:
    current: dict[str, Any] = raw
    for part in path_parts[:-1]:
        existing = current.get(part)
        if isinstance(existing, dict):
            current = existing
            continue

        new_map: dict[str, Any] = {}
        current[part] = new_map
        current = new_map

    current[path_parts[-1]] = value


def _coerce_env_value(value: str) -> Any:
    lowered = value.lower().strip()
    if lowered in {"true", "false"}:
        return lowered == "true"

    try:
        return int(value)
    except ValueError:
        pass

    try:
        return float(value)
    except ValueError:
        pass

    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value
