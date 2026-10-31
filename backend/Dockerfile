FROM node:22-bookworm-slim AS toju-builder

WORKDIR /workspace/backend/toju-client
COPY backend/toju-client/package.json backend/toju-client/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/toju-client/*.mjs ./

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

ARG INSTALL_PHARMA=false

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libgmp-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/backend

COPY backend/pyproject.toml backend/uv.lock backend/README.md ./
RUN if [ "$INSTALL_PHARMA" = "true" ]; then \
        uv sync --frozen --no-dev --no-install-project --extra pharma; \
    else \
        uv sync --frozen --no-dev --no-install-project; \
    fi

COPY backend/scripts ./scripts
COPY backend/src ./src
COPY backend/toju-client ./toju-client
RUN if [ "$INSTALL_PHARMA" = "true" ]; then \
        uv sync --frozen --no-dev --no-editable --extra pharma; \
    else \
        uv sync --frozen --no-dev --no-editable; \
    fi


FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS runner

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash libgmp10 libstdc++6 libatomic1 lsof make curl \
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
COPY --from=toju-builder /usr/local/bin/node /usr/local/bin/node
COPY --from=toju-builder /workspace/backend/toju-client ./.venv/lib/python3.12/site-packages/quantum_backend_v2/toju-client
COPY backend/Makefile backend/README.md backend/pyproject.toml ./
COPY backend/scripts ./scripts
COPY backend/src ./src

# Create required directories with proper permissions
RUN node --version \
    && mkdir -p /workspace/backend/quantum-backend/peer-logs \
    /workspace/backend/quantum-backend/libp2p \
    && chmod -R 755 /workspace/backend/quantum-backend

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/v1/ready', timeout=5)" || exit 1

EXPOSE 8080
EXPOSE 4011

# Use exec form for proper signal handling
CMD ["quantum-backend", "--host", "0.0.0.0", "--port", "8080"]
