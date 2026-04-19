.PHONY: install lint format test run demo demo-clean demo-clean-docker clean help

# Install runtime and development dependencies via uv.
install:
	uv sync --extra dev

# Run static analysis (ruff + mypy) on source and tests.
lint:
	uv run ruff check src tests
	uv run mypy src

# Auto-format source and tests with ruff formatter.
format:
	uv run ruff format src tests

# Execute the test suite with pytest.
test:
	uv run pytest

# Run backend-v2 API in development mode.
run:
	uv run quantum-backend-v2

# Start the local demo environment.
demo:
	./scripts/demo-start.sh

# Start demo after clearing local runtime artifacts.
demo-clean:
	./scripts/demo-start.sh --clean

# Alias of demo-clean (kept for workflow parity with backend v1).
demo-clean-docker:
	./scripts/demo-start.sh --clean

# Remove Python/build caches and local virtual environment.
clean:
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	rm -rf .pytest_cache .mypy_cache .ruff_cache .coverage htmlcov .venv

# Print available targets and quick usage notes.
help:
	@echo "Usage: make <target>"
	@echo "Targets:"
	@echo "  install    Install dependencies"
	@echo "  lint       Run linting checks and type checking"
	@echo "  format     Format code with ruff"
	@echo "  test       Run tests with pytest"
	@echo "  run        Run backend-v2 in development mode"
	@echo "  demo       Start the demo server with demo-start.sh"
	@echo "  demo-clean Clean the demo server with demo-start.sh --clean"
	@echo "  demo-clean-docker Clean-start the Docker container with the baked virtualenv"
	@echo "  clean      Clean the project"
