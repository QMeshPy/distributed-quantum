.PHONY: install lint format test run demo demo-clean clean help

install:
	uv sync --extra dev

lint:
	uv run ruff check src tests
	uv run mypy src

format:
	uv run ruff format src tests

test:
	uv run pytest

run:
	uv run uvicorn quantum_coordinator.asgi:app --host 0.0.0.0 --port 8080 --reload

demo:
	./scripts/demo-start.sh

demo-clean:
	./scripts/demo-start.sh --clean

clean:
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	rm -rf .pytest_cache .mypy_cache .ruff_cache .coverage htmlcov .venv

help:
	@echo "Usage: make <target>"
	@echo "Targets:"
	@echo "  install    Install dependencies"
	@echo "  lint       Run linting checks and type checking"
	@echo "  format     Format code with ruff"
	@echo "  test       Run tests with pytest"
	@echo "  run        Run the application in development mode with uvicorn"
	@echo "  demo       Start the demo server with demo-start.sh"
	@echo "  demo-clean Clean the demo server with demo-start.sh --clean"
	@echo "  clean      Clean the project"
