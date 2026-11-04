# Remote workers: connect your laptop to the mesh

This is the setup guide for joining a mesh. One laptop runs the **coordinator** (the backend). Every other laptop runs one or two **worker peers** that join it. Circuit jobs are split into blocks and the blocks execute on the workers' laptops.

- Workers only dial **out**. No port-forwarding, no router settings, no public IP on a worker.
- Workers can be on **different Wi-Fi networks**. The coordinator is reached either directly (same network) or through a **zrok tunnel** (different networks).
- Workers do **not** need a `.env` file, a database, API keys, or the full backend. Only the coordinator needs those.

**Contents**

1. [How it works](#1-how-it-works)
2. [What each person needs](#2-what-each-person-needs)
3. [Coordinator setup (macOS)](#3-coordinator-setup-macos)
4. [Reaching the coordinator: pick one path](#4-reaching-the-coordinator-pick-one-path)
5. [Worker setup](#5-worker-setup) — [Windows (CMD)](#windows-cmd) · [macOS](#macos) · [Linux](#linux)
6. [Verify it works](#6-verify-it-works)
7. [Run a job on the mesh](#7-run-a-job-on-the-mesh)
8. [Health checks and monitoring](#8-health-checks-and-monitoring)
9. [Firewall commands](#9-firewall-commands)
10. [Troubleshooting](#10-troubleshooting)
11. [Configuration reference](#11-configuration-reference)
12. [Known limits](#12-known-limits)

A second mesh layout (groups chained through each other instead of everyone connecting to the coordinator) is described in [tree-mesh.md](tree-mesh.md). **It does not work yet.**

---

## 1. How it works

```
 Worker laptops                                      Coordinator laptop

  alice-1 ─┐
  alice-2 ─┤  dial out          ┌───────────────┐
  bob-1   ─┼─────────────────►  │  libp2p :4011 │   backend API :8081 ◄── frontend
  carol-1 ─┤  (same Wi-Fi: direct, or through   │   + planner + Mongo
  ...     ─┘   a zrok tunnel)   └───────────────┘
```

- A job's circuit is split into **blocks**. For each block the coordinator picks a healthy peer, sends `reservation/prepare` and `reservation/commit`, then `fragment/dispatch`. The peer runs the block and returns the result.
- The coordinator sends work back over the **same connection the worker opened**, which is why workers need no open port.
- If a peer is unreachable or rejects a block, the coordinator moves that block to the **next peer** instead of failing the job.
- If a worker loses the coordinator (restart, network drop), it **re-dials every 15 seconds** by itself.
- A worker's **peer ID comes from its `--label`**. Same label means same ID, so **two machines (or two processes) must never share a label**.

## 2. What each person needs

| | Coordinator | Worker |
|---|---|---|
| Machine | macOS laptop (Linux works the same way) | Windows, macOS or Linux |
| What runs | Full backend (`make run`) | `scripts/run_remote_worker.py` |
| Python | 3.12 or 3.13 (uv installs it) | **3.12 or 3.13. Not 3.14.** |
| Install size | Full backend (large) | **Small**: about 84 packages, about 1 minute on a fast connection |
| `.env` file | **Yes** ([section 3](#3-coordinator-setup-macos)) | **No** |
| MongoDB | **Yes** | No |
| zrok | Only for the different-networks path | Only for the different-networks path |
| Needs to be reachable | TCP 4011 (or a zrok share) | Nothing |

Why the worker install is small: the full backend needs `pyscf`, which has no Windows build, and pulls in several GB of chemistry and ML libraries. A worker only needs the circuit simulator and PennyLane (for drug-discovery tasks), so it uses `requirements-remote-worker.txt` with pinned versions in `constraints-remote-worker.txt`.

Python 3.14 is not supported. Install 3.12 next to it; nothing needs uninstalling.

---

## 3. Coordinator setup (macOS)

### 3.1 Install the tools (once)

```bash
# Homebrew (skip if `brew --version` works): https://brew.sh
brew install git uv

# MongoDB (the backend will not start without a reachable MongoDB)
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

Check:

```bash
git --version
uv --version
mongod --version | head -1
brew services list | grep mongodb          # should say "started"
```

No local MongoDB? Use a MongoDB Atlas connection string instead and put it in `QB2_MONGODB_URI` below.

### 3.2 Get the code

```bash
git clone -b feat/remote-worker-nat https://github.com/QMeshPy/distributed-quantum
cd distributed-quantum/backend
make install                               # runs `uv sync --extra dev`; takes several minutes
```

(Use `-b main` once PR #132 is merged.)

### 3.3 Create `backend/.env`

This is the **minimum** that makes the backend boot and serve the mesh. The backend was started with only these values in a test, and it came up healthy and accepted workers.

```dotenv
# backend/.env

# Required: the backend refuses to start without a reachable MongoDB.
QB2_MONGODB_URI=mongodb://127.0.0.1:27017

# Required for local use: default is true, which makes every API call need a login.
QB2_AUTH_REQUIRED=false

# 0 = no in-process helper peers, so every block runs on the worker laptops.
# Use 1 or more if you want local helpers as a safety net.
QB2_LIBP2P_DEV_SERVICE_PEER_COUNT=0
```

Optional lines:

```dotenv
# Use a separate database so a demo never touches other data.
# (Matters if your local and deployed backends share one Atlas cluster.)
QB2_MONGODB_DATABASE=qds-mesh

# Only if the frontend runs on Vercel (see "Frontend options" below).
CORS_ORIGINS=https://your-app.vercel.app,http://localhost:3000
```

Leave everything else unset. Features that need other keys (the AI agent chat, payments, IPFS storage) will not work without them, but circuit jobs do not need them.

> The `.env` file is read **only when the backend starts**. After any edit, press `Ctrl+C` in the backend terminal and run `make run` again.

### 3.4 Start the backend

```bash
cd distributed-quantum/backend
make run
```

Leave this terminal open. It serves the API on `http://127.0.0.1:8081` and accepts workers on TCP port `4011`.

Keep the Mac awake for the whole session (a sleeping Mac drops every worker). Use a second terminal:

```bash
caffeinate -dims
```

### 3.5 Read the three values you give to workers

Wait 20 to 30 seconds after `make run`, then in a second terminal:

```bash
# 1) Backend is healthy
curl -s http://127.0.0.1:8081/api/v1/health

# 2) Coordinator peer ID
curl -s http://127.0.0.1:8081/api/v1/bootstrap/libp2p/runtime | python3 -c "import sys,json; print(json.load(sys.stdin)['host_peer_id'])"

# 3) Your LAN IP (only needed for the same-Wi-Fi path)
ipconfig getifaddr en0          # Wi-Fi on most Macs
ipconfig getifaddr en1          # try this if en0 prints nothing (Ethernet adapter)
ifconfig | grep "inet " | grep -v 127.0.0.1      # lists every address if neither works
```

The peer ID with the default settings is **`12D3KooWQbdErPwWTNpwGJnAcuHbZmTYb2zL19B3ua9rrvvmuLnV`** and stays the same across restarts, so you can print it on a slide. Still run the command to confirm, because it changes if `QB2_LIBP2P_PEER_ID` is set.

Workers need an address built from these:

| Path | Worker address |
|---|---|
| Same Wi-Fi | `/ip4/<YOUR-LAN-IP>/tcp/4011/p2p/<PEER-ID>` |
| Different networks (zrok) | `/ip4/127.0.0.1/tcp/4011/p2p/<PEER-ID>` (details in [section 4](#4-reaching-the-coordinator-pick-one-path)) |

### 3.6 Frontend options

- **Simplest (recommended for a live demo):** run the frontend on your own Mac (`cd frontend && bun install && bun run dev`, then open `http://localhost:3000`) and project it. Nothing else to configure. Create `frontend/.env.local` with `NEXT_PUBLIC_BACKEND_URL=http://localhost:8081`. Workers never open the frontend; they only run workers.
- **Vercel-hosted frontend:** the browser must reach your backend over HTTPS, so you need a public URL for port 8081. Set the variables listed in the table below.

| Where | Variable | Value |
|---|---|---|
| Vercel project settings | `NEXT_PUBLIC_BACKEND_URL` | `https://<your-public-api-url>` (then **redeploy**: the value is baked in at build time) |
| `backend/.env` | `CORS_ORIGINS` | `https://<your-vercel-domain>,http://localhost:3000` |

For the public URL of port 8081, use an ngrok HTTP tunnel (free tier supports HTTP with one static domain):

```bash
ngrok http --url=<your-free-static-domain>.ngrok-free.app 8081
```

(On older ngrok versions the flag is `--domain` instead of `--url`.) A static domain matters because `NEXT_PUBLIC_BACKEND_URL` is baked in at build time, so a URL that changes each run means a redeploy each time. **Test the Vercel site against your tunnel before a live demo.** This path has not been tested.

---

## 4. Reaching the coordinator: pick one path

| | Path A: same Wi-Fi | Path B: different networks (zrok) |
|---|---|---|
| Use when | Everyone is on one network and devices can talk to each other | Workers are on different Wi-Fi networks, or the network blocks device-to-device traffic |
| Extra software | None | zrok on the coordinator host **and** every worker |
| Accounts | None | A free zrok account for the coordinator host **and** every worker |
| Worker address | `/ip4/<LAN-IP>/tcp/4011/p2p/<ID>` | `/ip4/127.0.0.1/tcp/4011/p2p/<ID>` |

> **Public Wi-Fi warning.** Conference, hotel and cafe networks very often enable *client isolation*, which blocks laptops from reaching each other even on the same network. Path A then fails with a timeout. Test it on the actual network early, and have Path B ready. A phone hotspot or your own travel router usually works for Path A because it does not isolate clients.

### Path A: same Wi-Fi

Nothing to install. Give workers `/ip4/<YOUR-LAN-IP>/tcp/4011/p2p/<PEER-ID>`. Make sure your macOS firewall is not blocking incoming connections ([section 9](#9-firewall-commands)).

### Path B: different networks with zrok

zrok creates a private tunnel. The coordinator host *shares* port 4011. Each worker host *accesses* that share, which opens a port on their own laptop (`127.0.0.1:4011`) that is connected to the coordinator's port 4011. The worker then dials its own `127.0.0.1:4011`.

```
worker ─► 127.0.0.1:4011 ─► zrok ─► (internet) ─► zrok ─► coordinator localhost:4011 ─► backend
```

Because the coordinator host's side connects to `localhost`, the macOS firewall does not matter for this path.

TCP sharing in zrok is **private only**: there is no public address for raw TCP, so *every worker host needs a zrok account*, and the free tier has limits (bandwidth, shares). Check the current limits at <https://zrok.io/pricing/> before the event.

The command is named **`zrok2`** in the current zrok docs (version 2). Older guides say `zrok`. If `zrok2` is not found but `zrok` is, use that name in every command below.

#### B1. Everyone: install zrok2 and enable it (once)

**macOS:**

```bash
# download the macOS archive that matches your CPU (arm64 = Apple Silicon, amd64 = Intel)
# from https://github.com/openziti/zrok/releases (look for zrok2 ... darwin ... .tar.gz), then:
cd ~/Downloads && mkdir -p /tmp/zrok2 && tar -xf ./zrok*darwin*.tar.gz -C /tmp/zrok2
mkdir -p ~/bin && install /tmp/zrok2/zrok2 ~/bin/
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.zshenv && export PATH="$HOME/bin:$PATH"
zrok2 version
```

**Linux:**

```bash
curl -sSf https://get.openziti.io/install.bash | sudo bash -s zrok2
zrok2 version
```

**Windows (CMD):** download the Windows archive from the same releases page (`zrok2 ... windows ... .tar.gz`) into Downloads, then in **cmd.exe**:

```bat
mkdir "%USERPROFILE%\bin"
cd /d "%USERPROFILE%\Downloads"
for %f in (zrok*windows*.tar.gz) do tar -xf "%f" -C "%USERPROFILE%\bin"
set PATH=%PATH%;%USERPROFILE%\bin
zrok2 version
```

(In a `.bat` file write `%%f` instead of `%f`.) The `set PATH` line lasts only for that CMD window. To make it permanent, open *Start → "Edit the system environment variables" → Environment Variables → User variables → Path → New* and add `%USERPROFILE%\bin`. If `zrok2 version` says "not recognized", run `dir "%USERPROFILE%\bin"` to see the exact file name that was extracted.

**Create an account and enable (all platforms):**

1. Sign up at <https://myzrok.io>, then open <https://api-v2.zrok.io> (the zrok console).
2. Click the "get started" button and copy your **account token**.
3. Run:

```bash
zrok2 enable <YOUR-ACCOUNT-TOKEN>
zrok2 status
```

`zrok2 status` should show your API endpoint and mark the account token and environment as set. The account token is a password. Do not share it or post it in chat.

> The zrok docs describe sign-up through the myzrok.io web console. Some older guides mention `zrok invite` for creating accounts; the current hosted flow does not use it.

#### B2. Coordinator host: share port 4011

With the backend running (`make run`), in a new terminal:

```bash
zrok2 share private --headless --open --backend-mode tcpTunnel localhost:4011
```

It prints a **share token** and the command workers must run, something like `zrok2 access private <SHARE-TOKEN>`. Keep this terminal open for the whole session.

- `--open` lets **any zrok user who knows the share token** access it. That is the practical choice for a group of workers: the share token is the secret, so only give it to the people who should join, and stop and restart the share (new token) if it leaks.
- The default is a **closed** share, where only your account and accounts you explicitly grant can use it. To use that instead: drop `--open` and add `--access-grant user@example.com` for each person, or later run `zrok2 modify share <SHARE-TOKEN> --add-access-grant user@example.com`.
- The zrok docs also mention a `--share-token <name>` option to choose the token yourself. If it works for a TCP tunnel, it lets you print the same token on slides and reuse it after a restart. Try it during your rehearsal.

If you restart the share, the token changes (unless you set it yourself), and every worker host must restart their `access` command with the new token.

#### B3. Workers: open the tunnel

In a terminal that stays open (a separate window from the worker), after installing and enabling zrok:

```bash
zrok2 access private --bind 127.0.0.1:4011 <SHARE-TOKEN>
```

This works the same in Windows CMD, macOS and Linux. It listens on `127.0.0.1:4011` on the worker's own laptop. Quick test from another window:

```bash
python -c "import socket; socket.create_connection(('127.0.0.1', 4011), 5); print('TUNNEL OK')"
```

If port 4011 is already used on the worker's laptop, pick another (for example `--bind 127.0.0.1:4012`) and use `4012` in the worker address too.

The worker address is then `/ip4/127.0.0.1/tcp/4011/p2p/<PEER-ID>` (ignore the LAN IP completely).

#### Which values change for zrok

- **Coordinator `backend/.env`:** nothing extra. The zrok share connects to `localhost:4011`, which the backend already listens on. (`QB2_LIBP2P_ADVERTISE_MULTIADDRS` is not needed because workers are given the address by hand.)
- **Workers:** no `.env` at all. The only per-person values are the worker `--coordinator` address and `--label`.

> **Status of Path B: not tested.** The zrok commands above come from zrok's documentation. They have not been tested end to end (they need a zrok account), so **rehearse the whole setup with two laptops on different networks before a live demo.** In particular, confirm that two worker processes on one laptop can both dial the same `127.0.0.1:4011` access listener, and that about a dozen workers can use one share token at the same time. Neither is something the zrok docs state.

---

## 5. Worker setup

Every worker host needs three things from the coordinator host:

| Value | Example |
|---|---|
| Coordinator address | `/ip4/127.0.0.1/tcp/4011/p2p/12D3KooWQbdErPwWTNpwGJnAcuHbZmTYb2zL19B3ua9rrvvmuLnV` (zrok) or `/ip4/192.168.1.20/tcp/4011/p2p/...` (same Wi-Fi) |
| Your label (unique) | `alice-1` for your first peer, `alice-2` for your second |
| Share token (zrok path only) | `abc123xyz` |

**Labels:** 3 to 64 characters, letters, digits, `.`, `_`, `-` only. Use your first name plus a number (`alice-1`). If two people share a first name, add a last initial (`alice-k-1`). Two machines with the same label become one peer and break each other's connections.

**Running one or two peers:** one *worker process* is one peer. For two peers, open two terminal windows and start the worker in each, with **different labels** (`alice-1`, `alice-2`). Everything else is the same.

### Windows (CMD)

Use **Command Prompt (cmd.exe)** for every command below. Not PowerShell, not Git Bash.

**1. Check Python 3.12 or 3.13.**

```bat
py -0
```

If the list has no `3.12` or `3.13`, install it, then **close and reopen** Command Prompt:

```bat
winget install Python.Python.3.12
```

(No winget? Download the 3.12 installer from <https://www.python.org/downloads/> and tick *Add python.exe to PATH*.)

**2. Get the worker code.** Pick one option.

*Option A: git (small download).*

```bat
git --version
git clone --depth 1 -b feat/remote-worker-nat https://github.com/QMeshPy/distributed-quantum
cd distributed-quantum\backend
```

If `git` is missing: `winget install Git.Git`, then reopen Command Prompt.

*Option B: no git (about 480 KB).*

```bat
cd /d "%USERPROFILE%"
curl -L -o qmesh-worker.zip https://github.com/QMeshPy/distributed-quantum/raw/feat/remote-worker-nat/backend/qmesh-worker.zip
tar -xf qmesh-worker.zip
cd qmesh-worker
```

Both options leave you in a folder containing `src`, `scripts` and the two `.txt` files.

**3. Create the environment and install (once).**

```bat
py -3.12 -m venv .venv
.venv\Scripts\activate.bat
python --version
python -m pip install --upgrade pip
pip install -r requirements-remote-worker.txt -c constraints-remote-worker.txt
```

`python --version` must print `3.12.x` (or `3.13.x`). Your prompt gets a `(.venv)` prefix while the environment is active. You will see a warning about a *yanked grpcio version* during the install. It is harmless.

**4. (zrok path) open the tunnel in a second CMD window** — see [B3](#b3-workers-open-the-tunnel). Leave it running.

**5. Check you can reach the coordinator.** Same Wi-Fi path: use the LAN IP. zrok path: `127.0.0.1`.

```bat
python -c "import socket; socket.create_connection(('127.0.0.1', 4011), 5); print('REACHABLE')"
```

It must print `REACHABLE`. A timeout or error means the tunnel (or LAN path) is not working: stop and fix that first ([troubleshooting](#10-troubleshooting)).

**6. Start your worker.** Replace the address and label.

```bat
python -u scripts\run_remote_worker.py --coordinator /ip4/127.0.0.1/tcp/4011/p2p/12D3KooWQbdErPwWTNpwGJnAcuHbZmTYb2zL19B3ua9rrvvmuLnV --label alice-1
```

Every **new** CMD window needs this first (adjust the path to where you cloned or extracted):

```bat
cd /d %USERPROFILE%\distributed-quantum\backend
.venv\Scripts\activate.bat
```

(For Option B the folder is `%USERPROFILE%\qmesh-worker`.)

If Windows asks whether to let Python through the firewall, click **Allow**. The worker only makes outbound connections, so it works either way.

### macOS

Needs Python 3.12 or 3.13. The simplest way is [uv](https://docs.astral.sh/uv/), which fetches the right Python automatically.

```bash
# 1. Tools (Homebrew first if you don't have it: https://brew.sh)
brew install git uv

# 2. Code
git clone --depth 1 -b feat/remote-worker-nat https://github.com/QMeshPy/distributed-quantum
cd distributed-quantum/backend

# 3. Environment (about 1 minute)
uv venv --python 3.12 .venv
source .venv/bin/activate
python --version                      # must say 3.12.x
uv pip install -r requirements-remote-worker.txt -c constraints-remote-worker.txt

# 4. (zrok path) open the tunnel in a second terminal window; see B3

# 5. Check reachability (use the LAN IP on the same-Wi-Fi path)
python -c "import socket; socket.create_connection(('127.0.0.1', 4011), 5); print('REACHABLE')"

# 6. Start your worker
python -u scripts/run_remote_worker.py \
  --coordinator /ip4/127.0.0.1/tcp/4011/p2p/12D3KooWQbdErPwWTNpwGJnAcuHbZmTYb2zL19B3ua9rrvvmuLnV \
  --label alice-1
```

New terminal window? Run `cd distributed-quantum/backend && source .venv/bin/activate` first.

Without uv, use plain pip: `python3.12 -m venv .venv`, `source .venv/bin/activate`, then `pip install -r requirements-remote-worker.txt -c constraints-remote-worker.txt`.

### Linux

```bash
# 1. Tools (Debian/Ubuntu shown; use your package manager otherwise)
sudo apt update && sudo apt install -y git curl
curl -LsSf https://astral.sh/uv/install.sh | sh        # then open a NEW terminal

# 2. Code
git clone --depth 1 -b feat/remote-worker-nat https://github.com/QMeshPy/distributed-quantum
cd distributed-quantum/backend

# 3. Environment (uv downloads Python 3.12 if your system Python is wrong)
uv venv --python 3.12 .venv
source .venv/bin/activate
python --version                      # must say 3.12.x
uv pip install -r requirements-remote-worker.txt -c constraints-remote-worker.txt

# 4. (zrok path) open the tunnel in a second terminal; see B3

# 5. Check reachability
python -c "import socket; socket.create_connection(('127.0.0.1', 4011), 5); print('REACHABLE')"

# 6. Start your worker
python -u scripts/run_remote_worker.py \
  --coordinator /ip4/127.0.0.1/tcp/4011/p2p/12D3KooWQbdErPwWTNpwGJnAcuHbZmTYb2zL19B3ua9rrvvmuLnV \
  --label alice-1
```

The Linux steps have not been tested.

### What a healthy worker prints

```
Worker 'alice-1' peer ID: 12D3KooW... (namespace 'quantum-backend')
Waiting for work. Ctrl+C to stop.
[hh:mm:ss] Coordinator CONNECTED
```

Lines like `periodic advertisement published` are the worker's regular "I'm alive" message. When it gets a block you will see `reservation/prepare`, `reservation/commit` and `fragment/dispatch` lines. Stop a worker with `Ctrl+C`.

---

## 6. Verify it works

**Coordinator:** about 15 seconds after workers start:

```bash
curl -s http://127.0.0.1:8081/api/v1/discovery/peers | python3 -c "import sys,json; ps=json.load(sys.stdin)['peers']; print(len(ps),'peers'); [print(p['peer_id'][:14], p['health_status'], p['last_seen_at']) for p in ps]"
```

Expected count = **1 coordinator + the value of `QB2_LIBP2P_DEV_SERVICE_PEER_COUNT` + one per running worker process**. With `=0` and 12 people running 2 peers each, that is 25. A new peer may show `unknown` for up to one heartbeat interval (10 seconds) before it turns `healthy`.

**Worker:** the worker window shows `Coordinator CONNECTED`, and the coordinator's list shows your peer ID. Your peer ID is printed on the worker's first line.

**Dashboard:** open the frontend's mesh page (`/network/mesh`). Under **Connected Peers**, every peer is listed by its **label** (the `--label` you passed, for example `alice-1`) with its peer ID underneath. Click a peer to open its dossier, which shows the label, peer ID, health and when it was last seen. The list refreshes every 10 seconds, so a new worker appears shortly after it prints `Coordinator CONNECTED`. The coordinator itself appears under its own label (`qb2-local-peer` by default).

## 7. Run a job on the mesh

Submit through the circuit page of the frontend, or with curl on the coordinator laptop. This 4-qubit circuit splits into several blocks:

```
OPENQASM 2.0;
include "qelib1.inc";
qreg q[4];
h q[0];
cx q[0],q[1];
cx q[1],q[2];
cx q[2],q[3];
```

```bash
curl -s -X POST http://127.0.0.1:8081/api/v1/circuits/submit -H 'content-type: application/json' \
  -d '{"circuit":"OPENQASM 2.0;\ninclude \"qelib1.inc\";\nqreg q[4];\nh q[0];\ncx q[0],q[1];\ncx q[1],q[2];\ncx q[2],q[3];"}'
# returns {"job_id":"job-...","status":"QUEUED"}

curl -s http://127.0.0.1:8081/api/v1/jobs/<JOB-ID> | python3 -c "
import sys,json
d=json.load(sys.stdin); print(d['status'], d.get('error'))
for f in (d.get('result') or {}).get('fragment_results',[]): print(f['fragment_id'], f['node_id'][:14], f['status'])"
```

The last command prints which peer ran each block. Worker operators will see their own peer IDs there, and their worker windows show `fragment/dispatch`.

**Measurement lines:** if you add measurements, write them **one qubit at a time** (`measure q[0] -> c[0];` with `creg c[4];`). The whole-register form `measure q -> c;` fails with `No qubit arguments parsed for operation: measure q -> c`. The API's own example uses the whole-register form, so avoid copying it. Leaving measurements out entirely also works.

In tests with no local helper peers (`QB2_LIBP2P_DEV_SERVICE_PEER_COUNT=0`), every block ran on a worker. A circuit of the shape above splits into **one block per qubit**, and the planner spreads the blocks over the healthy peers. To make every laptop do work, use **at least as many qubits as there are worker peers**:

| Circuit (the chain above) | Result with 8 workers connected on one machine |
|---|---|
| 4 qubits | 4 blocks on 4 different workers, about 3 seconds |
| 8 qubits | 8 blocks on 8 workers, about 3 seconds |
| 12 to 14 qubits | all 8 workers used, about 3 seconds |
| 16 qubits | all 8 workers used, about 6 seconds |
| 18 qubits | about 17 seconds |
| 20 qubits | about 81 seconds (too slow for a live demo) |

For a live demo, use **8 to 14 qubits**. Times on real laptops over Wi-Fi will be longer than on one machine, because each block's state travels over the network. These numbers need the latest backend code: older code failed on any circuit above 13 qubits (see [Troubleshooting](#10-troubleshooting)).

### Drug discovery (Pharma) jobs

Stage 4 of the Pharma pipeline runs one VQE (a small quantum-chemistry optimisation) per molecule fragment. Those runs are sent to the worker laptops the same way circuit blocks are. Stages 1, 2, 3, 5 and 6 run on the coordinator.

```bash
curl -s -X POST http://127.0.0.1:8081/api/v1/pharma/submit \
  -H 'content-type: application/json' \
  -d '{"mode":"optimization","target_pdb_id":"1IEP","initial_ligand_smiles":"CC(=O)Oc1ccccc1C(=O)O","max_iterations":1,"candidate_count":10}'
curl -s http://127.0.0.1:8081/api/v1/pharma/jobs/<JOB-ID>
```

The job log shows who ran what, for example `12 VQE task(s): 3 fragment(s) x 4 start(s) over 12 connected peer(s)`, then one line per fragment with the labels of the peers that computed it. The result field `fragments_distributed` has the same mapping. Each worker window prints `compute/task` when it receives work.

How the work is split, so you can say it accurately on stage:

- **Each fragment is one independent VQE.** The aspirin example above has 3 fragments, so only 3 peers have necessary work.
- **When there are more peers than fragments, each fragment is run several times from different starting angles** (up to 10 starts) and the **first one to finish is used**, so a slow or frozen laptop never holds the job up. This puts every peer to work. It is redundancy, not extra accuracy: results were within 0.5 millihartree of exact, and a start that finishes first can be slightly less precise than the plain Hartree-Fock start (0.04 to 0.4 mHa in tests).
- **Peers pull tasks one at a time**, so a faster laptop takes more. A peer that disconnects or fails is dropped for that job and its task goes to another peer. If no peer can run a task, the coordinator runs it itself.

What the VQE computes (all of this is checked against an exact calculation, which is printed next to each result):

- Each fragment gets all its hydrogens and a 3D geometry, then a Hartree-Fock calculation in the STO-3G basis (PySCF, on the coordinator only).
- The four orbitals around HOMO/LUMO form the active space: **8 qubits**, with the lower orbitals frozen. The peer builds a UCCSD circuit and minimises the energy with COBYLA.
- The printed `exact` value is the exact ground energy of that same 8-qubit problem. In tests the VQE was within 0.1 millihartree of it (chemical accuracy is 1.6).
- The HOMO and LUMO values come from the Hartree-Fock orbitals, not from the VQE.
- **A fragment with an odd number of electrons is skipped and reported as `skipped`**, never replaced by a made-up value.
- **Molecule size.** The docking stage simulates one qubit per fragment per site (3 sites), so a pass of 5 fragments is 15 qubits and takes about 5 s. A molecule with more than 5 fragments is docked in several passes of at most 5; interactions between fragments of different passes are not modelled, and the job log says so. Only the VQE stage is spread over peers; docking and scoring run on the coordinator.
- **Watching it live:** on the job page, the **Peers** button opens a side panel listing every VQE task with the peer's label, its short ID, its state (waiting, running, done, failed, not needed) and how long it has run. A finished job shows which peers computed which fragment.

Measured on one Mac (10 cores) with real worker processes, aspirin (3 fragments), default settings:

| Workers | Tasks | Time for the whole job |
|---|---|---|
| none (coordinator alone) | 3 | 106 s |
| 3 | 3 | 44 to 46 s |
| 12 | 12 | 106 s (12 processes shared 10 cores) |
| 30 | 30 | 298 s (30 processes shared 10 cores) |

The 12 and 30 worker rows are slower because all the processes share one machine's 10 cores. Each task takes about 35 s when it has a core to itself (the 3-worker row). **This has not been measured on separate real laptops**, so rehearse with the real hardware before quoting a time.

One VQE is about 35 s on an Apple-silicon Mac; older laptops will be slower. Lower `vqe.max_iterations` in the job config to shorten it.

> **The finance, options and risk jobs (including portfolio optimization) still run entirely on the coordinator.** See [Known limits](#12-known-limits).

---

## 8. Health checks and monitoring

### Coordinator (macOS or Linux)

| What | Command |
|---|---|
| Backend is up | `curl -s http://127.0.0.1:8081/api/v1/health` |
| Coordinator peer ID | `curl -s http://127.0.0.1:8081/api/v1/bootstrap/libp2p/runtime` (field `host_peer_id`) |
| All peers and their health | `curl -s http://127.0.0.1:8081/api/v1/discovery/peers` |
| Network topology | `curl -s http://127.0.0.1:8081/api/v1/discovery/topology` |
| Discovery statistics | `curl -s http://127.0.0.1:8081/api/v1/discovery/stats` |
| libp2p port is listening | `lsof -nP -iTCP:4011 -sTCP:LISTEN` |
| Who is connected right now | `lsof -nP -iTCP:4011 -sTCP:ESTABLISHED` (one line per connection) |
| Count of connections | `lsof -nP -iTCP:4011 -sTCP:ESTABLISHED \| wc -l` |
| Job status | `curl -s http://127.0.0.1:8081/api/v1/jobs/<JOB-ID>` |
| Recent jobs | `curl -s http://127.0.0.1:8081/api/v1/jobs` |
| zrok share status | `zrok2 status` |
| MongoDB is running | `brew services list \| grep mongodb` |

Reading the peer list:

- `health_status`: `healthy` (heartbeating) or `unknown` (just joined, no heartbeat yet).
- `last_seen_at`: should be within a few heartbeat intervals. If it keeps getting older, the peer stopped talking.
- A peer silent for **300 seconds** is dropped from the list. A worker you kill stays listed until then.

What the backend terminal prints:

- `periodic advertisement published (peer_id=..., addrs=N)`: normal.
- `peer <id> unreachable: ...` followed by `trying next peer`: one peer failed on a block and the block moved to another. If the id in that line is the **coordinator's own**, it is harmless (the planner considered the coordinator itself and found no handler there).
- `failed across all assigned peers`: no peer could run a block. Check that workers are connected and healthy.

### Worker

| What | Windows (CMD) | macOS / Linux |
|---|---|---|
| Worker is connected | worker window prints `Coordinator CONNECTED` | same |
| Live connection exists | `netstat -an \| findstr 4011` (look for `ESTABLISHED`) | `lsof -nP -iTCP:4011 -sTCP:ESTABLISHED` |
| Tunnel listener is up (zrok) | `netstat -an \| findstr 4011` (look for `LISTENING`) | `lsof -nP -iTCP:4011 -sTCP:LISTEN` |
| Tunnel/network reachable | the `socket.create_connection` one-liner from step 5 | same |
| Python processes running | `tasklist \| findstr python` | `pgrep -fl run_remote_worker` |
| zrok is enabled | `zrok2 status` | `zrok2 status` |

## 9. Firewall commands

The coordinator must accept incoming connections on TCP 4011 **only on the same-Wi-Fi path**. On the zrok path the traffic reaches the backend over loopback, so the firewall is not involved. Workers only make outbound connections and need no firewall changes.

### macOS (coordinator)

```bash
# Is it on or off? (no sudo needed)
/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# Turn it OFF / ON (asks for your password)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate off
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on

# Keep it ON but let the backend's Python accept incoming connections
cd distributed-quantum/backend
PY="$(python3 -c 'import os; print(os.path.realpath(".venv/bin/python"))')"
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add "$PY"
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp "$PY"

# Review what is allowed or blocked
/usr/libexec/ApplicationFirewall/socketfilterfw --listapps
```

The same switch is in *System Settings → Network → Firewall*. With the firewall **off** (the usual default), macOS shows no "allow incoming connections" prompt at all.

### Linux (coordinator)

```bash
sudo ufw status                       # Ubuntu/Debian
sudo ufw allow 4011/tcp
sudo ufw disable                      # or: sudo ufw enable

sudo firewall-cmd --state             # Fedora/RHEL
sudo firewall-cmd --permanent --add-port=4011/tcp && sudo firewall-cmd --reload
```

### Windows (CMD, run as Administrator; only needed if a Windows machine ever hosts a listener)

```bat
netsh advfirewall show allprofiles state
netsh advfirewall set allprofiles state off
netsh advfirewall set allprofiles state on
netsh advfirewall firewall add rule name="qmesh-4011" dir=in action=allow protocol=TCP localport=4011
```

These are the standard commands for each system, but they have not been run as part of writing this guide. Try them on your own machine first.

---

## 10. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `REACHABLE` check times out (same Wi-Fi) | Client isolation on the network (very common on public networks), wrong IP (it changes: re-run `ipconfig getifaddr en0`), macOS firewall blocking, or the backend is not running. Try a phone hotspot, or switch to the zrok path. |
| `REACHABLE` check fails (zrok) | The `zrok2 access private` window is closed or errored, wrong share token, the coordinator host restarted the share (new token), the share is closed and your account was not granted access, or you are not enabled (`zrok2 status`). |
| `zrok2: command not found` / not recognized | PATH not set. Reopen the terminal, or re-run the PATH step in B1. If `zrok2` really does not exist but `zrok` does, use `zrok` everywhere. |
| `zrok2 access` says the port is in use | Something already uses 4011. Use `--bind 127.0.0.1:4012` and change `4011` to `4012` in the worker address. |
| Worker prints `not a valid multiaddr ending in /p2p/<peer-id>` | A typo in the address (it must start with `/ip4/` and end with `/p2p/<id>`), or extra spaces or line breaks. Copy it as one line. |
| Worker prints `NOT CONNECTED - retrying every 15s` | Coordinator not running, tunnel down, wrong IP, or wrong peer ID. Fix the cause; the worker reconnects on its own within about 15 seconds. |
| Worker was connected, then the laptop slept or changed Wi-Fi | A half-dead connection may not be noticed. `Ctrl+C` and start the worker again. |
| Worker is connected but never gets work | The planner gave the blocks to other peers (use a bigger circuit), or the job was a finance, options or risk job (not distributed). Confirm your peer is `healthy` in `/discovery/peers`. |
| Two workers appear as one peer, or the peer flips on and off | They share a label. Each process needs its own label. |
| `python --version` says 3.14 | Use 3.12 or 3.13. Windows: `py -3.12 -m venv .venv`. macOS/Linux: `uv venv --python 3.12 .venv`. |
| `.venv\Scripts\activate.bat` not found | You are in the wrong folder, or the venv was not created. Run `dir` and look for `.venv`; re-run step 3. |
| `pip install` prints "yanked version: grpcio" | A harmless warning. The install still succeeds. |
| `pip install` fails with a build error | Almost always Python 3.14. Check `python --version` inside the activated venv. |
| Windows asks about the firewall | Click **Allow**. The worker works either way. |
| Backend will not start: `MongoDB is not configured. Set QB2_MONGODB_URI.` | `QB2_MONGODB_URI` is missing from `backend/.env`. |
| Backend will not start: `ServerSelectionTimeoutError` | MongoDB is not running (`brew services start mongodb-community`) or the URI is wrong. |
| API calls return 401 / need login | `QB2_AUTH_REQUIRED=false` is missing from `.env`. Restart the backend after editing. |
| Peer count is not what you set | `.env` is read only at startup. Restart the backend. Remember: count = 1 coordinator + embedded + one per worker process. |
| Old workers still listed after they left | They are dropped after 300 seconds without a heartbeat. This is normal. |
| Job fails with `No qubit arguments parsed for operation: measure q -> c` | Use per-qubit measurements or none ([section 7](#7-run-a-job-on-the-mesh)). |
| Circuits above 13 qubits fail with `Data must be bytes and less or equal 65535 bytes`, and later jobs then fail with `No known addresses to peer` until the workers are restarted | Fixed in the latest backend code (large payloads are now sent in pieces). If you still see it, the coordinator is running old code: update, restart the backend, then restart every worker. |
| Job fails with `failed across all assigned peers` | Every peer failed the block. Check the backend log for `unreachable` lines and make sure workers are connected. |
| A job is slow | A dead peer was tried first; each failed attempt can cost up to about 15 seconds before the block moves on. |
| Everyone's workers dropped at once | The coordinator's Mac slept, the backend restarted, or the zrok share stopped. Workers reconnect by themselves once the coordinator is back, but after a zrok share restart workers must restart `zrok2 access` with the new token. |

Workers keep a small state file at `~/.qb2-worker/<label>.sqlite3` (Windows: `%USERPROFILE%\.qb2-worker`). It is safe to delete; the peer ID does not change because it comes from the label.

## 11. Configuration reference

**Coordinator `backend/.env`** (read at startup):

| Variable | Default | Meaning |
|---|---|---|
| `QB2_MONGODB_URI` | none, **required** | MongoDB connection string. |
| `QB2_AUTH_REQUIRED` | `true` | Set `false` for local and demo use. |
| `QB2_LIBP2P_DEV_SERVICE_PEER_COUNT` | `0` (the example file says `4`) | In-process helper peers. They listen on loopback from port 4021. `0` sends every block to remote workers. |
| `QB2_MONGODB_DATABASE` | `qds` | Database name. Use a separate one for demos. |
| `CORS_ORIGINS` | localhost:3000, 3001 | Comma-separated browser origins allowed to call the API. Add your Vercel domain. |
| `QB2_LIBP2P_LISTEN_MULTIADDRS` | `/ip4/0.0.0.0/tcp/4011` | Where the coordinator listens. |
| `QB2_LIBP2P_ADVERTISE_MULTIADDRS` | none | Public address to announce. Needed only for cloud deployments, not for a local mesh. |
| `QB2_LIBP2P_PEER_ID` | default label | Label that derives the coordinator's peer ID. |
| `QB2_API_PORT` | `8081` | API port. |

**Frontend / Vercel:**

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | Backend API URL (`http://localhost:8081` locally; your public HTTPS URL on Vercel; baked in at build time). |

**Worker `scripts/run_remote_worker.py` flags:**

| Flag | Meaning |
|---|---|
| `--coordinator` | `/ip4/<host>/tcp/<port>/p2p/<peer-id>` or `/dns4/...` (required). |
| `--label` | Unique name for this peer, 3 to 64 characters of letters, digits, `.`, `_`, `-` (required). |
| `--namespace` | Must match the coordinator (default `quantum-backend`). |
| `--heartbeat` | Seconds between heartbeats (default 10). |

## 12. Known limits

- **Only circuit jobs and the Pharma VQE stage are distributed.** Finance, options and risk jobs (including portfolio optimization) run entirely on the coordinator.
- **Pharma stages 5 and 6 (docking and scoring) run on the coordinator, and their output is not stable.** Two identical runs gave binding affinities of -5.21 and +1.03 kcal/mol. Do not present those numbers as a result; the distributed, verifiable part is the VQE.
- **Pharma VQE tasks wait up to 300 s** for a peer before it is treated as lost.
- **Workers running old code** (before the Pharma update) were not tested. They should fail the new request and be dropped for that job, but update every worker to be sure it gets a share.
- **No authentication on the mesh port.** Anyone who can reach port 4011 (or holds the zrok share token) and knows the namespace can join as a peer. Fine for a demo; do not leave it exposed.
- **Tested so far:** the coordinator and workers all on one Mac (including up to 30 worker processes on a Pharma job, killing a worker mid-job, no workers at all, a coordinator restart, and the lightweight install from a fresh environment, with and without PySCF), and a Windows laptop (Git Bash) on the same Wi-Fi. **Not tested:** Windows CMD commands, Linux, the zrok path, ngrok, public Wi-Fi, and more than a few peers at once. Rehearse the full setup before a live demo.
- **Half-dead connections** (Wi-Fi vanishes without closing the connection) may not be noticed; restart the worker.
- **Slow laptops:** a peer slower than the 15-second request timeout is treated as unreachable for that block.
- **The prebuilt zip can go stale.** `backend/qmesh-worker.zip` (Option B for Windows) is a snapshot of the worker code.
- **Chained groups** ([tree-mesh.md](tree-mesh.md)) do not work yet.
