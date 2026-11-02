"""Non-sensitive backend defaults.

Everything here used to live in ``backend/.env``. Secrets (DB URIs, API keys,
wallet secrets) stay in ``.env``; tuning values and feature switches live here.

Each constant is the default for an environment variable of the same purpose
(named in the comment). Setting that variable still overrides the constant, so
docker-compose / systemd deployments keep working without code changes.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Service identity and API server
# ---------------------------------------------------------------------------

# Service name used in logs and /health.                        (QB2_SERVICE_NAME)
SERVICE_NAME = "quantum-backend"

# Interface the API binds to. "0.0.0.0" = all interfaces,
# "127.0.0.1" = this machine only.                              (QB2_API_HOST)
API_HOST = "0.0.0.0"

# TCP port the API listens on.                                  (QB2_API_PORT)
API_PORT = 8081

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

# One of: "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL".      (QB2_LOG_LEVEL)
LOG_LEVEL = "INFO"

# True = one JSON object per log line (machine readable);
# False = human readable text.                                  (QB2_JSON_LOGS)
JSON_LOGS = True

# ---------------------------------------------------------------------------
# MongoDB (the connection URI itself is a secret: QB2_MONGODB_URI in .env)
# ---------------------------------------------------------------------------

# Logical database name inside MongoDB / Atlas.                 (QB2_MONGODB_DATABASE)
MONGODB_DATABASE = "qds"

# How long (ms) the driver looks for a reachable server before failing.
# Minimum 100.                                (QB2_MONGODB_SERVER_SELECTION_TIMEOUT_MS)
MONGODB_SERVER_SELECTION_TIMEOUT_MS = 5000

# ---------------------------------------------------------------------------
# Durable peer event log
# ---------------------------------------------------------------------------

# Directory for the append-only peer event log. Relative paths resolve from
# the directory the backend is started in (``backend/``).       (QB2_PEER_LOG_DIR)
PEER_LOG_DIR = "./quantum-backend/peer-logs"

# Identity written into peer log entries.                       (QB2_PEER_ID)
PEER_ID = "qb2-local-peer"

# True = fsync after every write (safe, slower);
# False = rely on the OS page cache (faster, can lose the tail on a crash).
#                                                               (QB2_PEER_LOG_FSYNC)
PEER_LOG_FSYNC = True

# ---------------------------------------------------------------------------
# libp2p networking
# ---------------------------------------------------------------------------

# Master switch for the real libp2p stack. False = no networking.
#                                                               (QB2_LIBP2P_ENABLED)
LIBP2P_ENABLED = True

# Peer label of the coordinator node. Embedded dev workers are named
# "<peer id>-worker-<n>".                                       (QB2_LIBP2P_PEER_ID)
LIBP2P_PEER_ID = "qb2-local-peer"

# Comma separated multiaddrs this node listens on.              (QB2_LIBP2P_LISTEN_MULTIADDRS)
LIBP2P_LISTEN_MULTIADDRS = "/ip4/0.0.0.0/tcp/4011"

# Comma separated multiaddrs advertised to other peers. Empty = derive from
# the listen addresses.                                         (QB2_LIBP2P_ADVERTISE_MULTIADDRS)
LIBP2P_ADVERTISE_MULTIADDRS = ""

# Comma separated peers to dial on startup. Empty = none (the coordinator
# itself, or a standalone dev setup). The embedded dev workers are pointed at
# the coordinator automatically.                                (QB2_LIBP2P_BOOTSTRAP_PEERS)
LIBP2P_BOOTSTRAP_PEERS = ""

# Namespace that scopes pubsub topics and protocol ids. Peers with a
# different namespace cannot see each other.                    (QB2_LIBP2P_RENDEZVOUS_NAMESPACE)
LIBP2P_RENDEZVOUS_NAMESPACE = "quantum-backend"

# SQLite file where known peers are remembered across restarts.
#                                                               (QB2_LIBP2P_PEERSTORE_PATH)
LIBP2P_PEERSTORE_PATH = "./quantum-backend/libp2p/peerstore.sqlite3"

# True = open real TCP listeners (needed for the local multi-peer fabric);
# False = in-process only.                                      (QB2_LIBP2P_ACTIVATE_LISTENERS)
LIBP2P_ACTIVATE_LISTENERS = True

# Seconds between peer heartbeats. A worker also re-sends its service
# advertisement every 5th heartbeat, so this sets how long a worker whose
# first advertisement was missed stays invisible (about 5 x this value).
# Minimum 5.                                    (QB2_LIBP2P_HEARTBEAT_INTERVAL_SECONDS)
LIBP2P_HEARTBEAT_INTERVAL_SECONDS = 5

# Seconds without a heartbeat before a peer is treated as stale.
# Minimum 30; keep well above the heartbeat interval.
#                                                (QB2_LIBP2P_STALE_PEER_TTL_SECONDS)
LIBP2P_STALE_PEER_TTL_SECONDS = 300

# Base TCP port of the embedded dev workers: worker n listens on
# base + n - 1 (4021, 4022, ...).                (QB2_LIBP2P_DEV_SERVICE_BASE_PORT)
LIBP2P_DEV_SERVICE_BASE_PORT = 4021

# NOTE: QB2_LIBP2P_DEV_SERVICE_PEER_COUNT (0-32, how many embedded worker
# peers to start; 0 = none) is deliberately NOT a constant: production must
# never spawn dev workers by accident. Set it in .env for local dev.
# NOTE: QB2_AUTH_REQUIRED and QB2_ENVIRONMENT stay in .env for the same
# reason; their code defaults are the safe production values.

# ---------------------------------------------------------------------------
# Wallet / chain
# ---------------------------------------------------------------------------

# Payment / wallet network name, e.g. "base-sepolia" (testnet). Toju storage
# only works on "base-sepolia".
#                                                               (NETWORK)
WALLET_NETWORK = "base-sepolia"

# ---------------------------------------------------------------------------
# AWS Bedrock
# ---------------------------------------------------------------------------

# True = use Bedrock; False = call the Anthropic API directly
# (needs ANTHROPIC_API_KEY).                                    (AWS_BEDROCK_ENABLED)
AWS_BEDROCK_ENABLED = True

# AWS region for Bedrock and other AWS clients.                 (AWS_REGION)
AWS_REGION = "us-east-1"

# Bedrock model / inference-profile id used when a caller names none.
#                                                               (AWS_BEDROCK_DEFAULT_MODEL)
AWS_BEDROCK_DEFAULT_MODEL = "us.anthropic.claude-sonnet-4-6"

# ---------------------------------------------------------------------------
# Agent LLM providers (API keys stay in .env; AGENT_LLM_PROVIDER, which picks
# groq | openrouter | near, also stays there because it depends on which key
# you have)
# ---------------------------------------------------------------------------

# Model id used with the Groq provider.                         (GROQ_MODEL)
GROQ_MODEL = "openai/gpt-oss-20b"

# Model id used with the OpenRouter provider.                   (OPENROUTER_MODEL)
OPENROUTER_MODEL = "nvidia/nemotron-3.5-lightning:free"

# ---------------------------------------------------------------------------
# Toju storage
# ---------------------------------------------------------------------------

# Toju API base URL.                                            (TOJU_API_URL)
TOJU_API_URL = "https://toju-devcon-testnet.onrender.com"
