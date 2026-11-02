# Remote workers: connecting more laptops as peers

Run the backend on one laptop (the **coordinator**) and join more laptops (**workers**) as peers. Workers can be on other Wi-Fi networks and need **no port-forwarding**: they dial out to the coordinator, and the coordinator sends work back over that same connection.

- [How it works](#how-it-works)
- [What you need](#what-you-need)
- [1. Start the coordinator](#1-start-the-coordinator)
- [2. Join a worker](#2-join-a-worker) — [Mac / Linux](#mac--linux) · [Windows (Git Bash)](#windows-git-bash)
- [3. Verify it works](#3-verify-it-works)
- [4. Run a job on the mesh](#4-run-a-job-on-the-mesh)
- [Health checks and monitoring](#health-checks-and-monitoring)
- [Troubleshooting](#troubleshooting)
- [Different Wi-Fi networks (ngrok / Tailscale)](#different-wi-fi-networks-ngrok--tailscale)
- [Configuration reference](#configuration-reference)
- [Known limits](#known-limits)

## How it works

```
   Laptop B (worker)  ──dials out──►  Laptop A (coordinator)  ◄──dials out──  Laptop C (worker)
   no open ports                      backend + libp2p :4011                  no open ports
                                      API :8081  ◄── frontend
```

- **Only the coordinator needs to be reachable** (TCP port `4011`). Workers open outbound connections only, which works behind any home or office NAT.
- The coordinator **reuses that inbound connection** to send work to the worker. Workers never need a public address.
- The physical layout is a star; the logical layout is a mesh. Peers learn about each other through gossip relayed by the coordinator.
- A worker's **peer ID is derived from its `--label`**, so it is stable across restarts. Two machines must never share a label.
- If a peer is unreachable or rejects work, the coordinator falls back to the next peer instead of failing the job.
- If a worker loses the coordinator (restart, network drop), it re-dials every 15 seconds on its own.
- The embedded local peers (`QB2_LIBP2P_DEV_SERVICE_PEER_COUNT`) still work exactly as before. Remote workers are added on top of them.

## What you need

| | Coordinator (laptop A) | Worker (Mac / Linux) | Worker (Windows) |
|---|---|---|---|
| What runs | Full backend (`make run`) | `scripts/run_remote_worker.py` | `scripts/run_remote_worker.py` |
| Install | Full backend (`make install`) | `git clone` + `uv sync` | Prebuilt zip + `pip` (see below) |
| Python | 3.12 or 3.13 | 3.12 or 3.13 (uv fetches it) | **3.12 or 3.13, not 3.14** |
| Terminal | any | any | Git Bash (commands below) |
| Reachable at | TCP `4011` | nothing | nothing |

**Why Windows is different:** the full backend depends on `pyscf`, which has no Windows build, so `uv sync` fails there. The worker only needs a small subset, shipped as `backend/qmesh-worker.zip` with pinned requirements.

Python 3.14 is not supported by the backend or its dependencies. Install 3.12 next to it; the `py` launcher lets you choose.

For a first test, put the machines on the **same Wi-Fi**. Different networks are covered [below](#different-wi-fi-networks-ngrok--tailscale).

## 1. Start the coordinator

On laptop A (Mac or Linux):

```bash
cd backend
make run
```

Leave this terminal open. If the laptop sleeps, workers lose their connection, so keep it awake (on macOS: `caffeinate -d` in a second terminal).

`.env` is read **only at startup**. After you edit `backend/.env` (for example `QB2_LIBP2P_DEV_SERVICE_PEER_COUNT`), press `Ctrl+C` and run `make run` again.

After 20 to 30 seconds, collect the two values workers need:

```bash
# Coordinator peer ID
curl -s http://127.0.0.1:8081/api/v1/bootstrap/libp2p/runtime | python3 -c "import sys,json; print(json.load(sys.stdin)['host_peer_id'])"

# LAN IP of this laptop (macOS)
ipconfig getifaddr en0
# LAN IP (Linux)
hostname -I | awk '{print $1}'
```

The worker address is then:

```
/ip4/<LAN-IP>/tcp/4011/p2p/<COORDINATOR-PEER-ID>
```

The peer ID stays the same across restarts. The IP can change if the router hands out a new one, so re-check it if a worker suddenly cannot connect.

If the OS firewall is on, allow incoming connections to the backend's Python process (macOS: System Settings → Network → Firewall; Linux: open TCP 4011, for example `sudo ufw allow 4011/tcp`).

## 2. Join a worker

### Mac / Linux

```bash
# 1. Install uv if you don't have it
curl -LsSf https://astral.sh/uv/install.sh | sh        # then open a new terminal

# 2. Get the code (the clone folder is named after the repo)
git clone -b feat/remote-worker-nat https://github.com/QMeshPy/distributed-quantum
cd distributed-quantum/backend

# 3. Install (a few minutes; uv downloads a matching Python if needed)
uv sync

# 4. Check this laptop can reach the coordinator
uv run python -c "import socket; socket.create_connection(('<LAN-IP>', 4011), 5); print('REACHABLE')"

# 5. Start the worker (label must be unique per machine)
uv run python scripts/run_remote_worker.py \
  --coordinator /ip4/<LAN-IP>/tcp/4011/p2p/<COORDINATOR-PEER-ID> \
  --label laptop-c
```

### Windows (Git Bash)

Use **Git Bash** for every command below, not PowerShell.

**1. Python 3.12.**

```bash
py -0                                   # must list 3.12 (or 3.13)
winget install Python.Python.3.12       # only if it doesn't; then open a NEW Git Bash
```

**2. Get the worker bundle.** Download [`backend/qmesh-worker.zip`](https://github.com/QMeshPy/distributed-quantum/raw/feat/remote-worker-nat/backend/qmesh-worker.zip) (about 480 KB) from the branch:

```bash
curl -L -o ~/Downloads/qmesh-worker.zip https://github.com/QMeshPy/distributed-quantum/raw/feat/remote-worker-nat/backend/qmesh-worker.zip
```

Then extract it to `C:\` so you get `C:\qmesh-worker`: in Explorer, right-click the zip → **Extract All**, and set the destination to `C:\`. (Git Bash usually has no `unzip`.) You do not need to clone the whole repository on Windows.

**3. Install, once:**

```bash
cd /c/qmesh-worker
py -3.12 -m venv .venv
source .venv/Scripts/activate
python --version                        # must say 3.12.x
python -m pip install --upgrade pip
pip install -r requirements-remote-worker.txt -c constraints-remote-worker.txt
```

**4. Check reachability** (works the same in Git Bash):

```bash
python -c "import socket; socket.create_connection(('<LAN-IP>', 4011), 5); print('REACHABLE')"
```

**5. Start the worker.** Every new Git Bash window needs the activate line first.

```bash
cd /c/qmesh-worker
source .venv/Scripts/activate
MSYS_NO_PATHCONV=1 python -u scripts/run_remote_worker.py \
  --coordinator /ip4/<LAN-IP>/tcp/4011/p2p/<COORDINATOR-PEER-ID> \
  --label laptop-b
```

Two Git Bash traps this command avoids:

- **`MSYS_NO_PATHCONV=1`**: Git Bash rewrites anything starting with `/` (like `/ip4/...`) into a Windows path such as `C:/Program Files/Git/ip4/...`, which breaks the address.
- **`python -u`**: stops output buffering so log lines appear immediately.

### Expected worker output

```
Worker 'laptop-b' peer ID: 12D3KooW... (namespace 'quantum-backend')
Waiting for work. Ctrl+C to stop.
[hh:mm:ss] Coordinator CONNECTED
```

Stop a worker with `Ctrl+C`.

## 3. Verify it works

On the coordinator, 10 to 20 seconds after the worker starts:

```bash
curl -s http://127.0.0.1:8081/api/v1/discovery/peers | python3 -c "import sys,json; [print(p['peer_id'][:14], p['health_status'], p['last_seen_at']) for p in json.load(sys.stdin)['peers']]"
```

Expected peer count = **1 coordinator + `QB2_LIBP2P_DEV_SERVICE_PEER_COUNT` embedded peers + one per remote worker**. With `=1` and one remote worker that is 3. A new worker may show `unknown` until its first heartbeat (up to `--heartbeat` seconds), then `healthy`.

## 4. Run a job on the mesh

Submit a multi-qubit circuit through the circuit submit page (the `/api/v1/circuits/submit` route) so the planner has several blocks to spread over the peers:

```
OPENQASM 2.0;
include "qelib1.inc";
qreg q[4];
h q[0];
cx q[0],q[1];
cx q[1],q[2];
cx q[2],q[3];
```

If the form requires a measurement, add `creg c[4];` and `measure q -> c;`.

On a worker that was given a block, its terminal prints:

```
[hh:mm:ss] reservation/prepare (… bytes)
[hh:mm:ss] reservation/commit …
[hh:mm:ss] fragment/dispatch …
```

The planner decides who gets which block, so a given worker may get none on small circuits.

> **Pharma jobs are not distributed yet.** The Pharma pipeline runs entirely on the coordinator today. Workers will only show their periodic "advertisement published" log lines during a Pharma job. See [Known limits](#known-limits).

## Health checks and monitoring

### On the coordinator

| Check | Command |
|---|---|
| Backend up | `curl -s http://127.0.0.1:8081/api/v1/health` |
| Coordinator peer ID | `curl -s http://127.0.0.1:8081/api/v1/bootstrap/libp2p/runtime` (field `host_peer_id`) |
| All peers and health | `curl -s http://127.0.0.1:8081/api/v1/discovery/peers` |
| Topology | `curl -s http://127.0.0.1:8081/api/v1/discovery/topology` |
| Discovery stats | `curl -s http://127.0.0.1:8081/api/v1/discovery/stats` |
| libp2p port is listening | macOS/Linux: `lsof -nP -iTCP:4011 -sTCP:LISTEN` |
| Who is connected right now | `lsof -nP -iTCP:4011 -sTCP:ESTABLISHED` (one line per worker, showing its IP) |
| Embedded peers running | `lsof -nP -iTCP -sTCP:LISTEN \| grep -E ':40(2[0-9])'` (ports 4021 and up, loopback only) |

Reading `/discovery/peers`:

- `health_status`: `healthy` (heartbeating) or `unknown` (just joined, no heartbeat yet).
- `last_seen_at`: should be within the last heartbeat interval or two. A value that keeps getting older means the peer stopped talking.
- A peer not heard from for **300 seconds** (the stale TTL) is dropped from the list.

### On a worker

| Check | What to look for |
|---|---|
| Connection state | `Coordinator CONNECTED` / `NOT CONNECTED - retrying every 15s` lines (printed only when the state changes) |
| Work received | `reservation/prepare`, `reservation/commit`, `fragment/dispatch` lines |
| Reachability | the `socket.create_connection` one-liner from step 4 |
| Live connection (Git Bash) | `netstat -an \| grep 4011` shows an `ESTABLISHED` line to the coordinator |
| Stays alive | the process keeps running; it exits with a message if its network thread dies |

The "periodic advertisement published" log lines are the worker's normal "I'm alive" message, not a problem.

### What the coordinator logs

- `periodic advertisement published (peer_id=..., addrs=N)`: normal gossip heartbeat.
- `peer <id> unreachable: ...` (warning): a peer failed during a job; the coordinator moved on to the next one.
- `failed across all assigned peers`: no peer could run a block (all unreachable or rejecting).

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Reachability check times out or errors | Not on the same network, router blocks device-to-device traffic (guest Wi-Fi / client isolation), OS firewall on port 4011, wrong IP (it changed), or the coordinator isn't running. Check `lsof -nP -iTCP:4011 -sTCP:LISTEN` on the coordinator. |
| `not a valid multiaddr ending in /p2p/<peer-id>` | On Windows Git Bash, you forgot `MSYS_NO_PATHCONV=1`. Also check there are no spaces or line-break typos in the address. |
| Worker prints `NOT CONNECTED` repeatedly | Coordinator not running, IP changed, or wrong peer ID. Re-run the commands in [step 1](#1-start-the-coordinator). It reconnects on its own once the coordinator is back. |
| Worker was connected, then the Wi-Fi changed or the laptop slept | A half-dead connection can go unnoticed. Press `Ctrl+C` and start the worker again. |
| Worker connected but never receives work | The planner didn't give it a block (try the 4-qubit circuit), or you ran a Pharma job (not distributed). Confirm the peer shows `healthy` in `/discovery/peers`. |
| Peer count is higher than expected | The backend was started before you edited `.env`; restart it. Also remember count = coordinator + embedded + remote workers. |
| Old "ghost" peers appear after a backend restart | Fixed on this branch (peers are no longer restored from Mongo at startup). Make sure the coordinator runs the latest branch code and restart it. |
| Two machines show up as one peer | They share a `--label`. Give each machine its own. |
| `python --version` says 3.14 (or `uv sync` / `pip` errors on build) | Use 3.12 or 3.13: on Windows `py -3.12 -m venv .venv`; on Mac/Linux uv picks a matching Python automatically. |
| `source: .venv/Scripts/activate: No such file` | The venv wasn't created in this folder, or you're in the wrong directory. On Mac/Linux the path is `.venv/bin/activate`. |
| Windows asks to allow Python through the firewall | Click Allow; the worker only makes outbound connections, so it works either way. |
| Peer status stuck on `unknown` | No heartbeat yet. Wait one heartbeat interval (default 10 s). If it never changes, the worker is connected but not publishing: restart it. |
| Job error `failed across all assigned peers` | Every candidate peer failed. Look for the `unreachable` warnings above it in the coordinator log; check the workers are running and `healthy`. |
| A job is slow the first time | A dead or ghost peer was tried first; each failed attempt can cost up to about 15 seconds before the fallback moves on. |

Useful extra detail: workers keep a small state file in `~/.qb2-worker/<label>.sqlite3`. Deleting it is safe; the peer ID does not change because it comes from the label.

## Different Wi-Fi networks (ngrok / Tailscale)

> **Status: not yet tested end to end.** The same-network steps above are the verified path. The setup below follows from how the mesh works, but treat it as a first attempt.

Workers on other networks only need an address for the coordinator that they can dial. Two options:

**ngrok TCP tunnel** (public address for port 4011; TCP tunnels may require a verified ngrok account):

```bash
ngrok tcp 4011
# Forwarding  tcp://0.tcp.ngrok.io:12345 -> localhost:4011
```

The worker address becomes (use `dns4`, not `ip4`, because ngrok gives a hostname):

```
/dns4/0.tcp.ngrok.io/tcp/12345/p2p/<COORDINATOR-PEER-ID>
```

The ngrok host and port change each time the tunnel restarts (unless you have a reserved address), so re-share the address with every worker after a restart.

**Tailscale** (alternative): install it on all laptops, join the same tailnet, and use the coordinator's Tailscale IP in place of `<LAN-IP>`. No tunnel to restart.

**Frontend on Vercel:** the browser also needs to reach the API on port 8081 over HTTPS. Start a second tunnel (`ngrok http 8081`, preferably with a static domain) and set `NEXT_PUBLIC_BACKEND_URL` to it. That variable is baked in at Vercel build time, so a changing URL means a rebuild. Locally this isn't needed (`http://localhost:8081`).

**Cloud (for example Lightsail):** set `QB2_LIBP2P_ADVERTISE_MULTIADDRS=/ip4/<static-ip>/tcp/4011` and open TCP 4011 in the instance firewall. `docker-compose.yaml` already publishes `4011:4011` on the backend. Workers then use the same `/ip4/<static-ip>/tcp/4011/p2p/<id>` address.

## Configuration reference

**Coordinator** (`backend/.env`, read at startup):

| Variable | Meaning |
|---|---|
| `QB2_LIBP2P_DEV_SERVICE_PEER_COUNT` | Embedded worker peers started inside the backend (0 for none; the compose default is 6). They listen on loopback from port `QB2_LIBP2P_DEV_SERVICE_BASE_PORT` (default 4021). With `0`, at least one remote worker must be connected for distributed jobs to run. |
| `QB2_LIBP2P_LISTEN_MULTIADDRS` | Where the coordinator listens (default `/ip4/0.0.0.0/tcp/4011`). |
| `QB2_LIBP2P_ADVERTISE_MULTIADDRS` | Public address the coordinator announces (cloud / tunnels). Not needed when workers are given the address manually. |
| `QB2_LIBP2P_PEER_ID` | Label that derives the coordinator's own peer ID. |
| `QB2_MONGODB_DATABASE` | Database name (default `qds`). Use a separate name locally if your local and deployed backends share one Atlas cluster. |

**Worker** (`scripts/run_remote_worker.py`):

| Flag | Meaning |
|---|---|
| `--coordinator` | `/ip4\|dns4/<host>/tcp/<port>/p2p/<peer-id>` (required). |
| `--label` | Unique name per machine, 3 to 64 characters of letters, digits, `.`, `_`, `-` (required). Derives the stable peer ID. |
| `--namespace` | Must match the coordinator's namespace (default `quantum-backend`). |
| `--heartbeat` | Seconds between heartbeats (default 10). |

## Known limits

- **Pharma jobs run only on the coordinator.** Only circuit jobs are sent to peers today. Distributing the Pharma VQE stage is planned but not built.
- **No authentication on port 4011.** Anyone who can reach it and knows the namespace can join as a peer (`enforce_enrollment` is off). Fine on a trusted LAN or for a demo; do not expose it to the open internet for anything sensitive.
- **Same-network setup is the verified path.** Windows-specific steps, the ngrok/Tailscale setup and a Mongo-backed run have not been fully tested on real separate machines.
- **Half-dead connections** (Wi-Fi vanishes without closing the connection) may not be noticed; restart the worker.
- **Slow laptops:** a peer that takes longer than the 15-second RPC timeout is treated as unreachable and the block goes to the next peer.
- **The zip can go stale.** `backend/qmesh-worker.zip` is a snapshot. After changing the worker or the backend source it uses, rebuild it, or have Windows users work from a clone.
