from __future__ import annotations

from pathlib import Path

import pytest

from quantum_coordinator.config.loader import ConfigError, load_config


def test_load_config_with_defaults() -> None:
    config = load_config(env={})

    assert config.api.port == 8080
    assert config.logging.level == "INFO"


def test_load_config_from_yaml_with_env_override(tmp_path: Path) -> None:
    config_file = tmp_path / "config.yaml"
    config_file.write_text(
        """
environment: test
api:
  port: 9000
logging:
  level: WARNING
""".strip(),
        encoding="utf-8",
    )

    config = load_config(
        path=config_file,
        env={
            "QC_API__PORT": "9100",
            "QC_LOGGING__LEVEL": "DEBUG",
        },
    )

    assert config.environment == "test"
    assert config.api.port == 9100
    assert config.logging.level == "DEBUG"


def test_invalid_config_raises(tmp_path: Path) -> None:
    config_file = tmp_path / "invalid.yaml"
    config_file.write_text(
        """
api:
  port: -1
""".strip(),
        encoding="utf-8",
    )

    with pytest.raises(ConfigError):
        load_config(path=config_file, env={})


def test_missing_config_file_raises(tmp_path: Path) -> None:
    with pytest.raises(ConfigError):
        load_config(path=tmp_path / "missing.yaml", env={})
