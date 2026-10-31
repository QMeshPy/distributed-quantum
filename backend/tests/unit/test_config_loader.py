from __future__ import annotations

import os
from decimal import Decimal
from pathlib import Path

import pytest

from quantum_backend_v2.config import load_settings, loader


def test_load_settings_reads_x402_gateway_secret() -> None:
    settings = load_settings(env={"QB2_X402_GATEWAY_SECRET": "test-shared-secret"})

    assert settings.x402_gateway_secret == "test-shared-secret"


def test_load_settings_reads_billing_settings() -> None:
    settings = load_settings(
        env={"QB2_BILLING_INTERNAL_SECRET": "b" * 32, "QB2_CIRCUIT_JOB_CREDIT_COST": "1.5"}
    )

    assert settings.billing_internal_secret == "b" * 32
    assert settings.circuit_job_credit_cost == Decimal("1.5")


def test_credit_metering_is_off_by_default() -> None:
    settings = load_settings(env={})

    assert settings.billing_internal_secret is None
    assert settings.circuit_job_credit_cost == Decimal("0")


def test_startup_environment_uses_one_file_and_preserves_process_overrides(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text("QB2_API_PORT=8082\nAGENT_AUTH_BRIDGE_SECRET=file-secret\n")
    monkeypatch.setattr(loader, "_default_env_file", lambda: env_file)
    monkeypatch.setenv("QB2_API_PORT", "9090")
    monkeypatch.delenv("AGENT_AUTH_BRIDGE_SECRET", raising=False)
    # Track the inserted key so monkeypatch restores the process after the test.
    monkeypatch.setenv("AGENT_AUTH_BRIDGE_SECRET", "")
    monkeypatch.delenv("AGENT_AUTH_BRIDGE_SECRET")

    loader.initialize_environment()

    assert os.environ["QB2_API_PORT"] == "9090"
    assert os.environ["AGENT_AUTH_BRIDGE_SECRET"] == "file-secret"
    assert load_settings().api_port == 9090


def test_explicit_settings_mapping_is_isolated_from_files_and_process(monkeypatch):
    monkeypatch.setenv("QB2_API_PORT", "9999")
    monkeypatch.setattr(loader, "_load_env_file", lambda _: pytest.fail("unexpected file read"))
    assert load_settings(env={}).api_port == 8081


def test_explicit_mapping_overrides_file_without_changing_process(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text("QB2_API_PORT=8082\n")
    monkeypatch.setenv("QB2_API_PORT", "9999")
    assert load_settings(env={"QB2_API_PORT": "8083"}, env_file=env_file).api_port == 8083
    assert os.environ["QB2_API_PORT"] == "9999"


def test_load_settings_reads_environment_overrides() -> None:
    settings = load_settings(
        env={
            "QB2_ENVIRONMENT": "staging",
            "QB2_SERVICE_NAME": "qb2-custom",
            "QB2_API_HOST": "127.0.0.1",
            "QB2_API_PORT": "9090",
            "QB2_LOG_LEVEL": "DEBUG",
            "QB2_JSON_LOGS": "false",
            "QB2_MONGODB_TARGET": "remote",
            "QB2_MONGODB_LOCAL_URI": "mongodb://127.0.0.1:27017",
            "QB2_MONGODB_REMOTE_URI": "mongodb://mongo.example:27017",
            "QB2_MONGODB_DATABASE": "qb2_projections",
            "QB2_PEER_LOG_DIR": "/tmp/qb2-peer-logs",
            "QB2_PEER_ID": "peer-alpha",
            "QB2_PEER_LOG_FSYNC": "false",
            "QB2_LIBP2P_ENABLED": "true",
            "QB2_LIBP2P_PEER_ID": "peer-alpha-libp2p",
            "QB2_LIBP2P_LISTEN_MULTIADDRS": "/ip4/0.0.0.0/tcp/4011,/ip4/0.0.0.0/udp/4011/quic",
            "QB2_LIBP2P_ADVERTISE_MULTIADDRS": "/ip4/127.0.0.1/tcp/4011",
            "QB2_LIBP2P_BOOTSTRAP_PEERS": "/dns4/bootstrap-a/tcp/4011,/dns4/bootstrap-b/tcp/4011",
            "QB2_LIBP2P_RENDEZVOUS_NAMESPACE": "qb2-network",
            "QB2_LIBP2P_PEERSTORE_PATH": "/tmp/qb2-libp2p/peerstore.sqlite3",
            "QB2_LIBP2P_ACTIVATE_LISTENERS": "true",
            "QB2_LIBP2P_DEV_SERVICE_PEER_COUNT": "4",
            "QB2_LIBP2P_DEV_SERVICE_BASE_PORT": "4121",
        }
    )

    assert settings.environment == "staging"
    assert settings.service_name == "qb2-custom"
    assert settings.api_host == "127.0.0.1"
    assert settings.api_port == 9090
    assert settings.logging.level == "DEBUG"
    assert settings.logging.json_logs is False
    assert settings.persistence.mongodb.target.value == "remote"
    assert settings.persistence.mongodb.local_uri == "mongodb://127.0.0.1:27017"
    assert settings.persistence.mongodb.remote_uri == "mongodb://mongo.example:27017"
    assert settings.persistence.mongodb.database == "qb2_projections"
    assert settings.persistence.mongodb.configured is True
    assert settings.persistence.mongodb.effective_uri == "mongodb://mongo.example:27017"
    assert str(settings.persistence.peer_log.directory) == "/tmp/qb2-peer-logs"
    assert settings.persistence.peer_log.peer_id == "peer-alpha"
    assert settings.persistence.peer_log.fsync is False
    assert settings.libp2p.enabled is True
    assert settings.libp2p.peer_id == "peer-alpha-libp2p"
    assert settings.libp2p.listen_multiaddrs == (
        "/ip4/0.0.0.0/tcp/4011",
        "/ip4/0.0.0.0/udp/4011/quic",
    )
    assert settings.libp2p.advertise_multiaddrs == ("/ip4/127.0.0.1/tcp/4011",)
    assert settings.libp2p.bootstrap_peers == (
        "/dns4/bootstrap-a/tcp/4011",
        "/dns4/bootstrap-b/tcp/4011",
    )
    assert settings.libp2p.rendezvous_namespace == "qb2-network"
    assert settings.libp2p.peerstore_path == Path("/tmp/qb2-libp2p/peerstore.sqlite3")
    assert settings.libp2p.activate_listeners is True
    assert settings.libp2p.dev_service_peer_count == 4
    assert settings.libp2p.dev_service_base_port == 4121


def test_load_settings_reads_dotenv_file(tmp_path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "\n".join(
            [
                "QB2_ENVIRONMENT=local",
                "QB2_SERVICE_NAME=qb2-dotenv",
                "QB2_MONGODB_TARGET=local",
                "QB2_MONGODB_LOCAL_URI=mongodb://127.0.0.1:27017",
                "QB2_PEER_LOG_DIR=/tmp/qb2-dotenv-logs",
                "QB2_LIBP2P_LISTEN_MULTIADDRS=/ip4/127.0.0.1/tcp/4011",
                "QB2_LIBP2P_PEERSTORE_PATH=/tmp/qb2-dotenv-peerstore.sqlite3",
            ]
        ),
        encoding="utf-8",
    )

    settings = load_settings(env={}, env_file=env_file)

    assert settings.environment == "local"
    assert settings.service_name == "qb2-dotenv"
    assert settings.persistence.mongodb.effective_uri == "mongodb://127.0.0.1:27017"
    assert settings.persistence.peer_log.directory == Path("/tmp/qb2-dotenv-logs")
    assert settings.libp2p.listen_multiaddrs == ("/ip4/127.0.0.1/tcp/4011",)
    assert settings.libp2p.peerstore_path == Path("/tmp/qb2-dotenv-peerstore.sqlite3")
