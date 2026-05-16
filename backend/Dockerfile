FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libgmp-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/backend

COPY backend/pyproject.toml backend/uv.lock backend/README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/scripts ./scripts
COPY backend/src ./src
RUN uv sync --frozen --no-dev


FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS runner

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash libgmp10 lsof make curl \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/workspace/backend/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # Production optimizations
    PYTHONHASHSEED=random \
    # Asyncio performance
    PYTHONASYNCIODEBUG=0

WORKDIR /workspace/backend

COPY --from=builder /workspace/backend/.venv ./.venv
COPY backend/Makefile backend/README.md backend/pyproject.toml ./
COPY backend/scripts ./scripts
COPY backend/src ./src

# Create required directories with proper permissions
RUN mkdir -p /workspace/backend/quantum-backend/peer-logs \
    /workspace/backend/quantum-backend/libp2p \
    && chmod -R 755 /workspace/backend/quantum-backend

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/v1/health', timeout=5)" || exit 1

EXPOSE 8080
EXPOSE 4011

# Use exec form for proper signal handling
CMD ["quantum-backend", "--host", "0.0.0.0", "--port", "8080"]
