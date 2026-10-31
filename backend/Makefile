ifeq ($(OS),Windows_NT)
BASH ?= C:/Program Files/Git/bin/bash.exe
else
BASH ?= bash
endif

.PHONY: install lint format test run run-clean clean help

# Install runtime and development dependencies via uv.
install:
	uv sync --locked

# Run static analysis (ruff + mypy) on source and tests.
lint:
	uv run --locked ruff check src tests
	uv run --locked mypy src

# Auto-format source and tests with ruff formatter.
format:
	uv run --locked ruff format src tests

# Execute the test suite with pytest.
test:
	uv run --locked pytest

# Run backend-v2 API with the standard local startup wrapper.
run:
	"$(BASH)" -lc "./scripts/demo-start.sh"

# Deprecated compatibility target; refuses to delete durable runtime data.
run-clean:
	"$(BASH)" -lc "./scripts/demo-start.sh --clean"

# Remove Python/build caches and local virtual environment.
clean:
	"$(BASH)" -lc "find . -type d -name __pycache__ -prune -exec rm -rf {} + && rm -rf .pytest_cache .mypy_cache .ruff_cache .coverage htmlcov .venv"

# Print available targets and quick usage notes.
help:
	@"$(BASH)" -lc "printf '%s\n' 'Usage: make <target>' 'Targets:' '  install    Install dependencies' '  lint       Run linting checks and type checking' '  format     Format code with ruff' '  test       Run tests with pytest' '  run        Start backend-v2 with the standard local startup wrapper' '  run-clean  Deprecated; back up and remove runtime data explicitly' '  clean      Clean the project'"
