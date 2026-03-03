.PHONY: install lint format test run clean

install:
	uv sync --extra dev

lint:
	uv run ruff check src tests
	uv run mypy src

format:
	uv run ruff format src tests

test:
	uv run pytest --cov=src/quantum_coordinator --cov-report=term-missing

run:
	uv run uvicorn quantum_coordinator.asgi:app --host 0.0.0.0 --port 8080 --reload

clean:
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	rm -rf .pytest_cache .mypy_cache .ruff_cache .coverage htmlcov .venv
