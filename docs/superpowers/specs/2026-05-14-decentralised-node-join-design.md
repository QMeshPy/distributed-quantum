# Decentralised Node Join — Design Spec

**Date:** 2026-05-14
**Status:** Approved
**Goal:** Allow anyone to run a real external quantum compute node that connects to the coordinator, appears in the Nodes table, and processes real circuit fragment work — reducing dependence on AWS Lightsail by distributing compute across operator-owned machines.

---

## 1. Context and Motivation

Today the "nodes" visible at `/network/nodes` are embedded worker peers — all running inside the same Python process on a single AWS Lightsail instance. They simulate a distributed network but share one machine's compute and one point of failure.

The coordinator's libp2p layer (`QB2_LIBP2P_LISTEN_MULTIADDRS: /ip4/0.0.0.0/tcp/4011`) is already exposed publicly. The `DiscoveryService` + `PeerRegistry` are already designed to handle real external peers. The only missing pieces are:

1. A real, runnable external node script that speaks the coordinator's exact wire protocols.
2. A UI onboarding flow that guides someone from zero to a running node.
3. A "My Nodes" health panel so operators can monitor their own nodes.

This is a BitTorrent-style model: more nodes = more compute capacity = less load on the central Lightsail instance.

---

## 2. Scope

Three deliverables, all self-contained:

| Deliverable | Location | Description |
|---|---|---|
| **A — Real node script** | `scripts/node-starter-template.py` | Fully functional external worker node |
| **B — Join page** | `frontend/.../network/nodes/join/` | Onboarding guide, script viewer, live detector, fallback form |
| **C — My Nodes panel** | `frontend/.../network/nodes/page.tsx` | Health panel above the node table, modal for 2+ nodes |

No changes to the coordinator Python backend. No new coordinator API endpoints. The external node speaks the existing wire protocols exactly.

---

## 3. Deliverable A — Real External Node Script

### 3.1 File

`scripts/node-starter-template.py` — a single self-contained Python file. Replaces the existing stub.

### 3.2 Dependencies

```
py-libp2p
qiskit
pydantic>=2
trio
anyio
multiaddr
```

Printed at the top of the file as a pip install command, and in a `requirements-node.txt` alongside it.

### 3.3 CLI Interface

```
python node-starter-template.py \
  --coordinator /ip4/<COORDINATOR_IP>/tcp/4011/p2p/<COORDINATOR_PEER_ID> \
  --label "My Quantum Node" \
  --port 4030 \
  --advertise-addr /ip4/<YOUR_PUBLIC_IP>/tcp/4030 \
  --services hadamard cnot bell_pair qft teleportation \
  --max-qubits 8 \
  --namespace quantum-backend \
  --heartbeat-interval 60 \
  --log-level INFO
```

| Argument | Default | Description |
|---|---|---|
| `--coordinator` | required | Full multiaddr of the coordinator including `/p2p/<peer_id>` |
| `--label` | `"My Quantum Node"` | Human-readable label; also seeds the Ed25519 key pair deterministically |
| `--port` | `4030` | TCP port this node listens on |
| `--advertise-addr` | auto-detected | Public multiaddr to advertise to the swarm |
| `--services` | all 11 service types | Subset of quantum services to offer |
| `--max-qubits` | `8` | Maximum concurrent qubits this node can handle |
| `--namespace` | `quantum-backend` | Rendezvous namespace; must match the coordinator |
| `--heartbeat-interval` | `60` | Seconds between heartbeat publishes |
| `--log-level` | `INFO` | Python logging level |

### 3.4 Startup Sequence

1. Parse args, configure logging.
2. Derive deterministic Ed25519 key pair from `sha256(label.encode())` — identical to `bootstrap.py:_derive_seed`. Peer ID is stable across restarts as long as the label stays the same.
3. Create SQLite peerstore at `~/.quantum-node/peerstore-<label>.sqlite3`.
4. Create py-libp2p host with key pair + peerstore. Listen on `--port`.
5. Create GossipSub + Pubsub wired to the host (`/meshsub/1.0.0`).
6. Start host and pubsub inside a trio nursery.
7. Connect to coordinator bootstrap peer via `--coordinator` multiaddr (20 retries, 0.5s delay).
8. Register 4 stream handlers for the execution protocols (see §3.6).
9. Publish initial `PeerAdvertisement` to `{namespace}.peer-advertisement.v1`.
10. Print peer ID, multiaddr, and dashboard instructions to stdout.
11. Enter heartbeat loop + stream handler event loop; run forever.

### 3.5 Wire Protocol Compliance

All schemas are inline Pydantic models byte-for-byte identical to the coordinator's `protocols/` and `discovery/models.py`. No import from the coordinator package — fully self-contained.

**GossipSub topics:**
- `{namespace}.peer-advertisement.v1` — published on start and every `5 × heartbeat_interval`
- `{namespace}.peer-heartbeat.v1` — published every `heartbeat_interval` seconds

**`PeerAdvertisement` payload:**
```python
{
  "peer_id": str,
  "trust_tier": "community",          # external nodes use "community" tier
  "network_addresses": [...],          # advertised multiaddrs
  "supported_protocols": ["/qb2/{namespace}/peer-exchange/1.0.0"],
  "service_summaries": [...],
  "peer_log_position": 0,
  "emitted_at": "<iso8601-utc>"
}
```

**`PeerHeartbeat` payload:**
```python
{
  "peer_id": str,
  "health_status": "healthy",
  "active_reservations": int,
  "active_executions": int,
  "peer_log_position": 0,
  "emitted_at": "<iso8601-utc>"
}
```

### 3.6 Execution Protocol Handlers

Four libp2p stream handlers on protocol IDs derived from the namespace:

| Protocol ID | Handler |
|---|---|
| `/qb2/{namespace}/reservation/prepare/1.0.0` | `handle_prepare` |
| `/qb2/{namespace}/reservation/commit/1.0.0` | `handle_commit` |
| `/qb2/{namespace}/reservation/cancel/1.0.0` | `handle_cancel` |
| `/qb2/{namespace}/execution/fragment-dispatch/1.0.0` | `handle_dispatch` |

Logic is identical to `libp2p/fragment_worker.py:PeerFragmentWorker`. In-memory reservation dict, capacity check via `max_concurrent_slots` (derived from `--max-qubits`), TTL-based expiry, idempotent result cache.

### 3.7 Quantum Execution

`handle_dispatch` calls `apply_fragments_to_state` — a full inline copy of `application/distributed_statevector.py`. Covers all 11 service types:

`hadamard`, `cnot`, `cz`, `controlled_unitary`, `programmable_gate`, `qft`, `teleportation`, `bell_pair`, `syndrome_extraction`, `distillation`, `measurement_feedforward`

Plus raw OpenQASM fragment text parsing, `rx/ry/rz/p/u` parametric gates, and all multi-qubit controlled variants. Uses `qiskit.quantum_info.Statevector` and `state_fidelity`.

### 3.8 Shutdown

`KeyboardInterrupt` / SIGTERM → graceful host close → prints "Node stopped."

### 3.9 Printed Output on Startup

```
============================================================
QUANTUM NODE STARTED
============================================================

  Peer ID   : 12D3KooW...
  Label     : My Quantum Node
  Listen    : /ip4/0.0.0.0/tcp/4030
  Advertise : /ip4/203.0.113.1/tcp/4030
  Services  : hadamard, cnot, bell_pair, qft, teleportation
  Namespace : quantum-backend

To register this node in the dashboard:
  1. Open https://<your-dashboard>/network/nodes/join
  2. Your node should appear automatically in ~30s
  3. If it does not, use the manual registration form with:
       Peer ID : 12D3KooW...
       Host    : 203.0.113.1
       Port    : 4030

============================================================
```

---

## 4. Deliverable B — `/network/nodes/join` Page

### 4.1 Route

```
frontend/src/app/(main)/network/nodes/join/page.tsx
frontend/src/features/network/components/join-page-client.tsx
```

### 4.2 Breadcrumb

`Network → Nodes → Join` — added to `frontend/src/constants/breadcrumbs.ts`.

### 4.3 Page Sections (top to bottom)

**Header**
`PageHeader` with `icon=Network`, `title="Join the Network"`, `glow="blue"`,
`description="Run your own quantum compute node and contribute to the decentralised fabric."`.

**Prerequisites card**
Glass card. Checklist:
- Python 3.11 or newer
- An open TCP port (default: 4030)
- ~300 MB disk for Qiskit
- Network connectivity to `<COORDINATOR_HOST>:4011`

Copy-pasteable install command:
```bash
pip install py-libp2p qiskit pydantic trio anyio multiaddr
```

**Step-by-step guide**
Numbered steps:
1. Install dependencies (install command above)
2. Download the node script (primary CTA button — `GET /api/network/node-script`)
3. Run it — copy the command below and replace `<COORDINATOR_MULTIADDR>` with the multiaddr from your deployment config (`QB2_LIBP2P_LISTEN_MULTIADDRS` + coordinator peer ID)
4. Watch for your node to appear below

**Inline script viewer**
Collapsible panel ("View full script source"). Fetches from `GET /api/network/node-script?view=1` (plain text). Scrollable syntax-highlighted `<pre>` block with Copy button. Collapsed by default.

**Live detector (`NodeAppearanceDetector` component)**
On mount, snapshots current peer IDs from `/api/network/peers`. Polls every 5 seconds. When a new peer ID appears that was not in the initial snapshot → success state: green badge, peer ID, "Your node joined the network!" message, link to `/network/nodes`. Timeout after 10 minutes → "Still waiting — try the manual form below."

**Manual fallback registration form**
Collapsible section ("Node did not appear automatically?"). Fields:
- Peer ID (required, min 10 chars)
- Host / IP (required)
- Port (required, 1024–65535)
- Label (optional, max 50 chars)

On submit → `POST /api/network/nodes/mine`. Success → toast + detector shows registered state. Error → inline message.

### 4.4 New API Routes

**`GET /api/network/node-script`**
Serves `scripts/node-starter-template.py` as a file download (`Content-Disposition: attachment; filename="node-starter-template.py"`). With `?view=1`, returns `text/plain` for the inline viewer.

**`GET /api/network/nodes/mine`**
Returns current user's registered nodes from MongoDB `user_nodes` collection.
```json
{ "nodes": [{ "peerId": "...", "label": "...", "registeredAt": "..." }] }
```

**`POST /api/network/nodes/mine`**
Registers a node for the current user.
```json
// Request body
{ "peerId": "12D3KooW...", "host": "203.0.113.1", "port": 4030, "label": "My Node" }
// Response
{ "peerId": "...", "label": "...", "registeredAt": "..." }
```
Returns 409 if `(userId, peerId)` already exists.

---

## 5. Deliverable C — "My Nodes" Panel on `/network/nodes`

### 5.1 Data Flow

`useMyNodes` hook → `GET /api/network/nodes/mine` (TanStack Query, staleTime 60s).
`useNetworkNodes` hook → `GET /api/network/peers` (already exists, polls every 30s).
Client-side cross-reference: for each registered peer ID, find matching entry in live peers list. If found → live stats. If not found → shows grey "Offline" badge with "Not seen by coordinator yet."

### 5.2 Zero My Nodes

No panel rendered. Existing `NodeTable` fills the page unchanged.

### 5.3 Exactly One My Node

`MyNodePanel` card rendered above `NodeTable`. Contents:
- Node label + truncated peer ID with copy button
- Health status badge (live)
- Last seen timestamp (relative)
- Active reservations counter
- Active executions counter
- "Ping" button → `GET /api/network/peers/{peerId}`, refreshes entry, shows toast
- "Setup guide" link → `/network/nodes/join`

### 5.4 Two or More My Nodes

`MyNodesButton` above `NodeTable` — "My Nodes · {count}". Clicking opens a shadcn `Dialog`. Modal contains one card per registered node (same fields as §5.3) and an "Add another node" link → `/network/nodes/join`.

### 5.5 MongoDB Schema

Collection: `user_nodes`

```
{
  _id:            ObjectId,
  user_id:        string,       // Better Auth user ID
  peer_id:        string,       // libp2p peer ID
  label:          string | null,
  host:           string | null,
  port:           number | null,
  registered_at:  datetime
}
```

Indexes:
- `{ user_id: 1 }` — fast per-user lookup
- `{ user_id: 1, peer_id: 1 }` unique — prevents duplicate registrations

---

## 6. Error Handling

| Scenario | Behaviour |
|---|---|
| Coordinator unreachable on node startup | Retries 20× with 0.5s delay, then exits with a clear error message |
| External node loses connection mid-session | Coordinator stale-peer TTL (300s default) marks it stale; node retries bootstrap reconnect |
| Manual registration of already-registered peer ID | API returns 409; UI shows inline "Already registered" error |
| Live detector times out (10 min) | Shows "still waiting" state with link to manual form; no error thrown |
| Ping returns 404 | Toast "Node not found — it may be offline" |
| Script viewer fetch fails | Fallback: "Download the script to view it" |
| `apply_fragments_to_state` raises an exception | Caught in `handle_dispatch`; returns `ExecutionResultPayload` with `transition=FAILED` and `error_detail` |

---

## 7. Files Created / Modified

### New files
```
scripts/node-starter-template.py                                   ← replace stub (Deliverable A)
scripts/requirements-node.txt                                      ← pip deps for node operators
frontend/src/app/(main)/network/nodes/join/page.tsx
frontend/src/features/network/components/join-page-client.tsx
frontend/src/features/network/components/my-node-panel.tsx
frontend/src/features/network/components/my-nodes-button.tsx
frontend/src/features/network/components/node-appearance-detector.tsx
frontend/src/features/network/hooks/use-my-nodes.ts
frontend/src/app/api/network/nodes/mine/route.ts
frontend/src/app/api/network/node-script/route.ts
```

### Modified files
```
frontend/src/app/(main)/network/nodes/page.tsx   ← add MyNodePanel / MyNodesButton above NodeTable
frontend/src/constants/breadcrumbs.ts            ← add join breadcrumb entry
```

---

## 8. Out of Scope

- RBAC / admin gating for node registration (no `role` field exists in `AuthSession` today)
- Deleting a registered node from "My Nodes"
- Node-level metrics beyond what the coordinator's peer registry provides
- Paying or incentivising node operators
- Making the coordinator enforce enrollment for external nodes (`enforce_enrollment` is currently `False`)
