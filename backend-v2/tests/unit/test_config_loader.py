from __future__ import annotations

from pathlib import Path

from quantum_backend_v2.config import load_settings


def test_load_settings_reads_environment_overrides() -> None:
    settings = load_settings(
        env={
            "QB2_ENVIRONMENT": "staging",
            "QB2_SERVICE_NAME": "qb2-custom",
            "QB2_API_HOST": "127.0.0.1",
            "QB2_API_PORT": "9090",
            "QB2_LOG_LEVEL": "DEBUG",
            "QB2_JSON_LOGS": "false",
            "QB2_POSTGRES_TARGET": "neon",
            "QB2_POSTGRES_LOCAL_DSN": "postgresql+asyncpg://postgres:password@127.0.0.1:5432/qb2",
            "QB2_POSTGRES_NEON_POOLED_DSN": "postgresql+asyncpg://pool.example/qb2",
            "QB2_POSTGRES_NEON_DIRECT_DSN": "postgresql+asyncpg://direct.example/qb2",
            "QB2_POSTGRES_DATABASE": "qb2_platform",
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
            "QB2_LIBP2P_BOOTSTRAP_PEERS": "/dns4/bootstrap-a/tcp/4011,/dns4/bootstrap-b/tcp/4011",
            "QB2_LIBP2P_RENDEZVOUS_NAMESPACE": "qb2-network",
            "QB2_LIBP2P_PEERSTORE_PATH": "/tmp/qb2-libp2p/peerstore.sqlite3",
            "QB2_LIBP2P_ACTIVATE_LISTENERS": "true",
        }
    )

    assert settings.environment == "staging"
    assert settings.service_name == "qb2-custom"
    assert settings.api_host == "127.0.0.1"
    assert settings.api_port == 9090
    assert settings.logging.level == "DEBUG"
    assert settings.logging.json_logs is False
    assert settings.persistence.postgres.target.value == "neon"
    assert settings.persistence.postgres.local_dsn == "postgresql+asyncpg://postgres:password@127.0.0.1:5432/qb2"
    assert settings.persistence.postgres.neon_pooled_dsn == "postgresql+asyncpg://pool.example/qb2"
    assert settings.persistence.postgres.neon_direct_dsn == "postgresql+asyncpg://direct.example/qb2"
    assert settings.persistence.postgres.database == "qb2_platform"
    assert settings.persistence.postgres.resolved_database == "qb2"
    assert settings.persistence.postgres.configured is True
    assert settings.persistence.postgres.effective_app_dsn == "postgresql+asyncpg://pool.example/qb2"
    assert settings.persistence.postgres.effective_migration_dsn == "postgresql+asyncpg://direct.example/qb2"
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
    assert settings.libp2p.bootstrap_peers == (
        "/dns4/bootstrap-a/tcp/4011",
        "/dns4/bootstrap-b/tcp/4011",
    )
    assert settings.libp2p.rendezvous_namespace == "qb2-network"
    assert settings.libp2p.peerstore_path == Path("/tmp/qb2-libp2p/peerstore.sqlite3")
    assert settings.libp2p.activate_listeners is True


def test_load_settings_reads_dotenv_file(tmp_path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "\n".join(
            [
                "QB2_ENVIRONMENT=local",
                "QB2_SERVICE_NAME=qb2-dotenv",
                "QB2_POSTGRES_TARGET=local",
                "QB2_POSTGRES_LOCAL_DSN=postgresql+asyncpg://postgres:pw@127.0.0.1:5432/qb2",
                "QB2_MONGODB_TARGET=local",
                "QB2_MONGODB_LOCAL_URI=mongodb://127.0.0.1:27017",
                "QB2_PEER_LOG_DIR=/tmp/qb2-dotenv-logs",
                "QB2_LIBP2P_LISTEN_MULTIADDRS=/ip4/127.0.0.1/tcp/4011",
                "QB2_LIBP2P_PEERSTORE_PATH=/tmp/qb2-dotenv-peerstore.sqlite3",
            ]
        ),
        encoding="utf-8",
    )

    settings = load_settings(env_file=env_file)

    assert settings.environment == "local"
    assert settings.service_name == "qb2-dotenv"
    assert settings.persistence.postgres.target.value == "local"
    assert settings.persistence.postgres.effective_app_dsn == (
        "postgresql+asyncpg://postgres:pw@127.0.0.1:5432/qb2"
    )
    assert settings.persistence.postgres.resolved_database == "qb2"
    assert settings.persistence.mongodb.effective_uri == "mongodb://127.0.0.1:27017"
    assert settings.persistence.peer_log.directory == Path("/tmp/qb2-dotenv-logs")
    assert settings.libp2p.listen_multiaddrs == ("/ip4/127.0.0.1/tcp/4011",)
    assert settings.libp2p.peerstore_path == Path("/tmp/qb2-dotenv-peerstore.sqlite3")
