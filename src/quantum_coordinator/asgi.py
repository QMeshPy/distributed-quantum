"""ASGI entrypoint for uvicorn and deployment."""

from quantum_coordinator.application.bootstrap import create_application

app = create_application()
