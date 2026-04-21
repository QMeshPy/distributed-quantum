"""CLI entrypoint for backend v2."""

from __future__ import annotations

import argparse

import uvicorn

from quantum_backend_v2.config import load_settings


def main() -> None:
    """Run the backend-v2 FastAPI server."""
    parser = argparse.ArgumentParser(description="Run the Quantum Backend V2 API")
    parser.add_argument("--host", default=None, help="Override API host")
    parser.add_argument("--port", type=int, default=None, help="Override API port")
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable uvicorn auto-reload for local source editing.",
    )
    args = parser.parse_args()

    settings = load_settings()
    host = args.host or settings.api_host
    port = args.port or settings.api_port
    uvicorn.run(
        "quantum_backend_v2.bootstrap.application:create_application",
        factory=True,
        host=host,
        port=port,
        reload=args.reload,
        reload_dirs=["src"] if args.reload else None,
    )


if __name__ == "__main__":
    main()
