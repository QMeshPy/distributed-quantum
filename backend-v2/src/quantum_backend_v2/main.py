"""CLI entrypoint for backend v2."""

from __future__ import annotations

import argparse

import uvicorn

from quantum_backend_v2.bootstrap import create_application
from quantum_backend_v2.config import load_settings


def main() -> None:
    """Run the backend-v2 FastAPI server."""
    parser = argparse.ArgumentParser(description="Run the Quantum Backend V2 API")
    parser.add_argument("--host", default=None, help="Override API host")
    parser.add_argument("--port", type=int, default=None, help="Override API port")
    args = parser.parse_args()

    settings = load_settings()
    app = create_application()
    host = args.host or settings.api_host
    port = args.port or settings.api_port
    uvicorn.run(app, host=host, port=port, reload=True, reload_dirs=["src"])
