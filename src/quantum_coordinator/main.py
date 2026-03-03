"""CLI entrypoint for running the coordinator API."""

from __future__ import annotations

import argparse

import uvicorn

from quantum_coordinator.application.bootstrap import create_application


def main() -> None:
    """Run the coordinator API server."""
    parser = argparse.ArgumentParser(description="Run Quantum Libp2p Coordinator API")
    parser.add_argument("--config", default=None, help="Path to YAML/TOML config file")
    parser.add_argument("--host", default=None, help="Override API host")
    parser.add_argument("--port", type=int, default=None, help="Override API port")
    args = parser.parse_args()

    app = create_application(config_path=args.config)
    config = app.state.config

    host = args.host or config.api.host
    port = args.port or config.api.port

    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    main()
