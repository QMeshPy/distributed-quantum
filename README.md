<div align="center">

# QMeshPy: Distributed Quantum Services with Algorand x402

**Quantum computation as discoverable, machine-payable peer-to-peer services powered by py-libp2p, Qiskit, and Algorand x402.**

[![Python](https://img.shields.io/badge/Python-3.12%20%7C%203.13-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![Qiskit](https://img.shields.io/badge/Qiskit-1.x-6929C4?logo=ibm&logoColor=white)](https://qiskit.org/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/QMeshPy/distributed-quantum?color=brightgreen)](https://github.com/QMeshPy/distributed-quantum/commits/main)

</div>

[Run locally](#updated-setup-and-configuration) · [Watch the demo](https://www.loom.com/share/8c5a546cb99a4a98996e738bf23c3e7a) · [Architecture](#architecture) · [Paid services](#algorand-x402-machine-payable-quantum-services) · [Agent storage](#toju-agent-storage-testnet-integration) · [Documentation](#documentation)

> **Upgrading an existing installation?** This cleanup includes **BREAKING** changes to storage credentials, database routing, authenticated routes, dependency extras, deployment behavior, and documentation paths. Read the [migration and release notes](documentations/guides/audit-cleanup-migration.md) before upgrading; they separate confirmed breaks from potential regressions and include rollout and rollback steps. Existing data is not migrated automatically.

---

## What this is

QMeshPy is a research platform that treats quantum operations as network services. Submit an OpenQASM circuit, distribute its execution across worker peers, and follow the job in a Next.js operator console.

A FastAPI coordinator discovers peers over py-libp2p (GossipSub), compiles circuits into distributed execution plans, routes fragments over libp2p streams, and assembles results with Qiskit statevector simulation. The same infrastructure powers a QAOA portfolio optimizer that benchmarks quantum against classical baselines.

Start with a local circuit or CSV finance experiment. Payments, agent chat, and IPFS storage are optional integrations you can add afterward.

> **Scope:** this is a proof of concept using simulators. The console uses email sign-in; the backend's local development bypass must be disabled before sharing the API.

### Applications

| Application | What it does | Status |
|---|---|---|
| Circuit orchestration | Normalize OpenQASM, plan, and execute distributed fragments across worker peers | Available |
| Financial modelling | QAOA portfolio benchmarks against classical optimization | Available |
| Risk and options | Simulated VaR, CVaR, credit-risk, and option-pricing experiments | Available |
| Molecular workflows | Drug-discovery research pipeline with simulated quantum stages | Experimental |

### Architecture

```
  Next.js operator console  ──(BFF proxy, REST)──▶  FastAPI coordinator
                                                          │
                                           py-libp2p runtime (Trio)
                                      Ed25519 host · GossipSub · stream RPC
                                                          │
                                       ┌──────────────────┼──────────────────┐
                                  Worker peer        Worker peer        Worker peer

  Persistence: MongoDB (jobs, events and projections) · JSONL (peer log)
```

### What the research found

The project's simulator benchmarks identify classical COBYLA parameter search as roughly 97% of QAOA runtime. At that serial fraction, adding quantum nodes alone gives at most 1.03x speedup under Amdahl's Law. See the [bottleneck measurements](https://github.com/QMeshPy/documentations/blob/main/technical/IMPLEMENTATION_NOTES.md).

The original research summary reports a crossover at larger portfolio sizes: classical wins at 10–20 assets, with QAOA reported as 3.2x faster at 40 and 9.5x at 60. These are findings for the project's simulator setup and selected classical baselines, not a demonstrated hardware advantage. Read the [research paper draft](https://github.com/QMeshPy/documentations/blob/main/research/RESEARCH_PAPER_DRAFT.md) for the research context.

---

## Algorand x402: machine-payable quantum services

QMeshPy exposes two paid services through the x402 `402 Payment Required` flow, settled in Algorand USDC. A client requests a service, receives the payment requirement, pays on-chain, and the coordinator then runs the job across the libp2p mesh.

| Service | Route | Execution |
|---|---|---|
| Quantum circuit execution | `POST /api/x402/quantum/runs` | Distributed across worker peers |
| QAE options pricing | `POST /api/x402/options/runs` | Quantum-finance pipeline |

The routes are disabled unless `X402_ENABLED=true`. Both have completed paid calls on Algorand TestNet; the transaction evidence is in the overview.

- [Overview, request flow and TestNet verification](https://github.com/QMeshPy/documentations/blob/main/algorand-x402/overview.md)
- [Design](https://github.com/QMeshPy/documentations/blob/main/algorand-x402/algorand-x402-design.md)
- [TestNet runbook](https://github.com/QMeshPy/documentations/blob/main/algorand-x402/algorand-x402-runbook.md)
- [Implementation](https://github.com/QMeshPy/distributed-quantum/tree/main/frontend/src/features/x402) (`frontend/src/features/x402`, plus the internal routes in `backend/src/quantum_backend_v2/api/routers/`)

### Configure Algorand x402 (TestNet)

After [local setup](#updated-setup-and-configuration), add these settings to `frontend/.env.local`. Generate a separate gateway secret with `openssl rand -hex 32` and set the same value as `QB2_X402_GATEWAY_SECRET` in `backend/.env` (or root `.env` for Compose).

```dotenv
X402_ENABLED=true
X402_NETWORK=testnet
X402_AVM_ADDRESS=<58-character Algorand receiver address>
X402_FACILITATOR_URL=https://facilitator.goplausible.xyz
X402_QUANTUM_RUN_PRICE=\$0.01
X402_GATEWAY_SECRET=<generated-gateway-secret>
```

The escaped dollar sign preserves the price in Next.js env files. Never put a payer mnemonic or private key in application configuration. Receiver funding, USDC opt-in, verification, and the MainNet switch are covered in the [TestNet runbook](https://github.com/QMeshPy/documentations/blob/main/algorand-x402/algorand-x402-runbook.md).

---

## Toju agent storage: testnet integration

Agents can draft a report in chat and propose storing it on public IPFS through
the **full Toju server**. Ask naturally: **“Let's store this proposal so we can
access it later.”** The agent prepares an immutable approval card; only the
signed-in owner can approve publication and its capped testnet payment.

The card stays beside its original response. Later messages continue below it,
and saved conversations survive reloads. Use **Agents → Agent Chat** in the
navigation bar to try the flow.

### Links and deployment boundaries

| Resource | Location |
| --- | --- |
| Integration branch | `feat/toju-agent-storage` in both [QMeshPy](https://github.com/QMeshPy/distributed-quantum/tree/feat/toju-agent-storage) and [Winter-Soren](https://github.com/Winter-Soren/distributed-quantum-services/tree/feat/toju-agent-storage) |
| Toju API readiness | [Render health](https://toju-devcon-testnet.onrender.com/health) |
| Toju API liveness | [Render liveness](https://toju-devcon-testnet.onrender.com/health/live) |
| Full Toju server source | [Winter-Soren/afara, devcon/testnet](https://github.com/Winter-Soren/afara/tree/devcon/testnet), forked from the official Toju server |
| Hosting instructions | [Full Render / Neon / QStash guide](https://github.com/QMeshPy/documentations/blob/main/toju/toju-render-testnet-guide.md) |
| Video demo | [Watch the Toju agent storage demo on Google Drive](https://drive.google.com/file/d/1PZ6MHxBd5_XOqMTGnrS6OEB_tGlL6uGX/view?usp=drive_link) |

**QuantumNodes runs locally for this demo. Render hosts the separate full Toju
Node/Express server**, including its storage, payment, database and lifecycle-job
routes. `backend/toju-client` is a payment/verification worker, not a replacement
storage server. The retired `services/toju-demo` prototype must not be deployed.

Agent storage payments use **Base Sepolia** (`eip155:84532`) and faucet USDC.
The server's separate Solana route uses **Solana testnet**, with program
`CSXnfQsFWxdPB5pnS73TQDA6ivK6kcFnRwtt6TgFquxH`. This agent demo does not execute
a Solana payment. Neither route automatically falls back to mainnet.

<details>
<summary>Run the Toju demo, inspect receipts, or host your own server</summary>

### Run the integration locally

Complete [local setup](#updated-setup-and-configuration) first, including email
sign-in and the shared auth bridge. Then install **Node 22** and the isolated
payment worker's dependencies:

```sh
# From the repository root
cd backend/toju-client
npm ci
```

Merge the following into `backend/.env`, preserving existing credentials and
database settings. This example uses the shared testnet Toju service listed above:

```dotenv
AGENT_LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=<your-own-openrouter-key>
OPENROUTER_MODEL=<available-free-model-id>

CDP_API_KEY_ID=<your-own-cdp-key-id>
CDP_API_KEY_SECRET=<your-own-cdp-key-secret>
CDP_WALLET_SECRET=<your-own-cdp-wallet-secret>
NETWORK=base-sepolia

TOJU_API_URL=https://toju-devcon-testnet.onrender.com
TOJU_PAYMENT_RECIPIENT=0xbB2Fc1cc295b53a75217319eA421256dABB3eacb
TOJU_NODE_BINARY=node
```

`TOJU_NODE_BINARY` must resolve to Node 22; use its absolute path if your shell's
default differs. All backend services use the MongoDB target and database selected
during local setup. Preserve an existing `qds` or custom database name when upgrading.

For Groq instead, set `AGENT_LLM_PROVIDER=groq`, `GROQ_API_KEY`, and
`GROQ_MODEL=openai/gpt-oss-20b`. OpenRouter accepts only free model names and sends
zero-price provider limits. For NEAR AI Cloud private inference in a Confidential TEE,
set `AGENT_LLM_PROVIDER=near`, `NEARAI_API_KEY`, and `NEAR_MODEL` (canonical Confidential TEE
model ID from `https://cloud-api.near.ai/v1/model/list` with `attestationSupported=true`);
configure a per-key spend limit in the NEAR dashboard. Each completion round is verified
with `nearai-inference-sdk` and surfaced as an attestation badge (`Model TEE verified`,
`Gateway verified`, or `Unverified`) on the chat message.

The agent chat UI includes a provider dropdown (Groq / OpenRouter / NEAR) that overrides the env default
per browser; `AGENT_LLM_PROVIDER` remains the server fallback. There is no paid fallback or automatic
rate-limit retry. Free model availability can change.

MongoDB stores chat/agent state and authentication; Neon belongs to the separate
Toju server. Provider keys, the auth bridge and CDP
signing credentials are server-only; never prefix them with `NEXT_PUBLIC_`.

Restart the backend, sign in at [localhost:3000](http://localhost:3000), and open
**Agents → Agent Chat**. Use your own agent and its CDP Base Sepolia wallet. Fund it with
test USDC using the [Circle faucet](https://faucet.circle.com/) before approving
an export. Do not use mainnet funds or another user's wallet.

### Try a draft, approval and receipt

1. Ask: `Draft a short Bell-pair experiment proposal. Clearly label it as a proposed experiment that has not been run. Show only the draft for now.`
2. Then ask: `Let's store this proposal so we can access it later.`
3. Review the exact content, public-IPFS notice, recipient, SHA-256, 30-day
   retention and price. Click **Cancel** to decline or **Approve & store** once
   to publish. A direct `yes` applies only to the current pending approval.
4. Wait for **Stored and retrieved. SHA-256 verified.** Open the artifact and
   testnet payment links. The worker checks the on-chain USDC Transfer and the
   downloaded bytes; an upload response alone is not treated as proof.
5. Reload the saved chat to see the persisted receipt. For an uncertain outcome,
   use **Check receipt (no new payment)**; never repay automatically.

The model can also propose exporting an owned workflow run ID. The backend reads
that user's stored run snapshots and exports selected metadata/results rather
than trusting model-invented results. Exports are limited to 256 KiB, approval
expires after 15 minutes, and the current payment policy caps each export at
24 micro-USDC (`0.000024` test USDC). Changing server pricing requires reviewing
the client's matching policy; mismatched quotes fail closed.

### Host your own full Toju server on Render

Follow the [complete hosting guide](https://github.com/QMeshPy/documentations/blob/main/toju/toju-render-testnet-guide.md), which
includes every environment variable, pricing initialization, migrations and
signed QStash schedule. The reproduced installation uses Render Free, Neon Free
and QStash Free; check your account's quotas before inviting additional users.

- Deploy the **afara server fork**, branch `devcon/testnet`, with Render's
  root directory blank. Do not deploy this entire QuantumNodes repository as Toju.
- Use Node 22, `NODE_ENV=staging`, `X402_NETWORK=sepolia`,
  `FILECOIN_NETWORK=calibration`, and a Solana testnet RPC/IDL.
- Provide your own Neon `DATABASE_URL`, Pinata JWT/gateway, Resend sender/key,
  QStash current/next signing keys, admin API secret and Base Sepolia recipient.
  Keep all secrets in Render's environment settings.
- Build: `corepack pnpm --filter server... install --frozen-lockfile --prod=false && corepack pnpm --dir server run build`
- Start: `corepack pnpm --dir server exec tsx scripts/migrate.ts staging && node server/dist/index.js`
- Set Render's health-check path to `/health/live`. Check `/health` separately
  for database readiness and initialize pricing as documented in the guide.
- Configure the five signed lifecycle/usage jobs described in the guide.
  Do not schedule `/jobs/destroy`.
- Point your QuantumNodes backend's `TOJU_API_URL` at your new service and set
  `TOJU_PAYMENT_RECIPIENT` to its exact `BASE_USDC_WALLET` public address.

The demo endpoint above is a shared test service, not a production availability
guarantee. Its hosted `/health` returning healthy does not by itself verify
payment settlement, IPFS retrieval or lifecycle cleanup.

### Verification and known limits

The earlier **DevCon Demo** draft completed a testnet payment and verified
retrieval: [public report](https://gateway.pinata.cloud/ipfs/bafybeiaw3wgnhn5yort3hvvzohvyd6ms43xmjat4qhj4jaazr3e2rnuvie/report.md)
and [Base Sepolia transaction](https://sepolia.basescan.org/tx/0x4b9e24bb741676455f1b5aa611d7459bd2b6fbf8666bf8353a2eca84602fa1fe).
A later approved draft was pinned but settlement failed; its uncertain receipt
is preserved. The exact historical settlement failure was not captured.

Run the focused checks without consuming model quota or making payments:

```sh
cd backend
uv run --locked pytest tests/services/test_agent_bridge.py tests/services/test_groq_agent.py tests/services/test_toju_storage.py
cd toju-client
npm test
cd ../../frontend
bun x tsc --noEmit --incremental false
```

The database-backed storage test runs only when `QB2_MONGODB_TEST_URI` explicitly
points to a local MongoDB instance. It creates and removes a uniquely named test
database. Provider/payment calls in these checks are mocked. Previously recorded live
coverage includes one completed export, receipt recovery and a signed QStash
usage snapshot. A full quantum experiment, Solana/Filecoin payments, renewal
email flow and time-based deletion have not been verified end to end. Public
IPFS copies may remain after pin retention ends. Free-tier cold starts, quotas
and external settlement failures remain demo limitations.

</details>

---

## Platform content node (Kubo)

The optional Kubo service gives the platform its own IPFS content node, with
authenticated backend writes, a local read gateway, persistent pins, and optional
Prometheus monitoring. It is separate from the quantum-worker network and is not
required for compute. IPFS content is public; a CID does not make a document private.

For configuration, see the [content-node guide](documentations/guides/content-node.md).
The operational walkthrough below covers deployment, token rotation, storage limits,
and the checks that protect existing data.

<details>
<summary>Deploy and operate Kubo, including storage and monitoring checks</summary>

The Compose stack includes **Kubo v0.43.1**, pinned by release tag and multi-platform
image digest. **Before starting or upgrading**, set `KUBO_RPC_SECRET` privately in
`.env`: a random 32–128 character token containing only letters, digits, `_` or `-`
(for example, generate one with `openssl rand -hex 32`). Use the raw token, without
`bearer:`. Protect `.env` with mode `0600`; never commit or paste its contents.
Missing/invalid secrets prevent the Kubo daemon from starting, not backend compute.
With current Docker Engine/Compose, start only the content node:

```bash
docker compose up -d --wait kubo
docker compose exec kubo sh /opt/qmesh/kubo-rpc.sh diag healthy
docker compose stop kubo
```

No wallet/provider credentials or backend startup are required. Compose may warn about
unset variables for the existing backend, even when starting only Kubo. If port
8080 is in use, run `KUBO_GATEWAY_PORT=18080 docker compose up -d --wait kubo`
(or set that variable in `.env`). The gateway remains loopback-only.

| Interface | Exposure |
|---|---|
| Swarm `4001/tcp` and `4001/udp` | Published for IPFS peers, separate from quantum-worker libp2p |
| Gateway `8080/tcp` | `127.0.0.1:8080` only; read locally stored content at `/ipfs/<CID>`; no writes |
| RPC `5001/tcp` | **Not published** or proxied by Caddy; authenticated backend access at `http://kubo:5001` on `content_network` |

The named `kubo_data` volume persists `/data/ipfs` across container recreation.
Stopping/removing a container does not remove it. Volume deletion permanently
removes this node's data and identity; do not use `docker compose down --volumes`
on a deployment unless you intend to delete **all** that project's named volumes.
The backend has no Kubo health dependency: content failures must not block compute.

`IPFS_PROFILE=server` applies **only when a new repository is initialized**. It
turns off mDNS and NAT port mapping and filters private swarm addresses. The
image sets `Addresses.API=/ip4/0.0.0.0/tcp/5001` and
`Addresses.Gateway=/ip4/0.0.0.0/tcp/8080` **inside the container**. Host exposure is
controlled by the mappings above. The server profile does not retrofit existing
repositories; back up the volume and review migrations before changing versions.
The security hook below, unlike the profile, runs on **every container start**.
See the pinned [release](https://github.com/ipfs/kubo/releases/tag/v0.43.1),
[profile/configuration reference](https://github.com/ipfs/kubo/blob/v0.43.1/docs/config.md#server-profile),
[image entrypoint](https://github.com/ipfs/kubo/blob/v0.43.1/bin/container_daemon),
and [healthcheck](https://github.com/ipfs/kubo/blob/v0.43.1/Dockerfile).

### RPC authorization and managed controls

Compose mounts `deploy/kubo-init.sh` read-only into the official image's init
hooks. It reapplies native `API.Authorizations` before the daemon starts, including
on existing volumes. Missing hook files fail the mount rather than silently
starting an unprotected node. The backend and Kubo share `KUBO_RPC_SECRET`;
Caddy does not receive it or join their dedicated `content_network`.

Clients send `Authorization: Bearer <raw token>`. The backend scope permits only
`id`, `diag/healthy`, `add`, `cat`, `pin/add`, `pin/rm`, `pin/ls`, `dag/import`, and
`block/stat`. Configuration, shutdown and other admin commands are denied even
with that token. Native `/version` also requires authentication, but is implicitly
allowed for valid tokens regardless of `AllowedPaths`. The healthcheck reads its
token inside the container and suppresses command output.

The hook also manages:

- Local-only gateway fetching (`Gateway.NoFetch=true`), no DNSLink and no exposed
  routing API. Kubo removed `Gateway.Writable` in v0.20: do not set that obsolete
  key; the supported gateway is read-only.
- Basic swarm connection-manager watermarks **32/96** (trimming targets, not a
  hard connection count), resource management enabled with a **1024** networking
  file-descriptor budget, and unused relay/AutoNAT server duties disabled.
- Repository config permissions `0600`. `Swarm.ResourceMgr.MaxMemory` is left at
  its default: it is not a process-memory cap. Production memory/disk sizing and
  quotas need workload-specific tuning, separately from these swarm controls.

These managed keys, including the entire `API.Authorizations` map, are overwritten
on restart; do not rely on manual edits to them. To rotate the token, update the
private `.env` then run `docker compose up -d --force-recreate kubo backend`.
This briefly interrupts clients but retains content/pins/identity; the old token
is revoked. Do not delete the volume or rerun `ipfs init` to rotate credentials.
Docker administrators and repo readers remain trusted: the token is present in
container environments and native config, and expanded Docker/Compose config or
process inspection can reveal it. Never expose it through browser variables,
logs or public proxies. See the pinned [native authorization implementation](https://github.com/ipfs/kubo/blob/v0.43.1/core/corehttp/commands.go#L176)
and [resource-management guidance](https://github.com/ipfs/kubo/blob/v0.43.1/docs/production/low-memory.md).

### Storage targets, automatic GC and private monitoring

`deploy/kubo-storage.sh` runs after the security hook on **every start**, including
existing volumes. It manages `Datastore.StorageMax` (default **10GB**),
`Datastore.StorageGCWatermark` (**90%**) and `Datastore.GCPeriod` (default **1h**).
Compose enables `daemon --enable-gc`, preserving the image's migration/version flags.
Tune `KUBO_STORAGE_MAX` and `KUBO_GC_PERIOD` privately in `.env`, then recreate Kubo.
Accepted formats are a positive integer of up to six digits followed by `MB`/`GB`/`TB`
or `s`/`m`/`h`, respectively; fractions, spaces and leading zeroes are rejected before
configuration is changed. Empty values use defaults. These keys overwrite manual
repo edits at restart. **Upgrading enables automatic GC on existing volumes**:
pin content you need and back up the repository before recreating the node.

**StorageMax is a soft GC target, not a disk quota.** Every GC interval Kubo checks
whether raw-block storage exceeds the watermark; it only collects unpinned,
unreferenced blocks. Recursively pinned DAGs and live MFS roots are retained even
above StorageMax, so pins can fill the disk. Metadata and datastore overhead require
additional headroom; deleting blocks need not immediately shrink every datastore.
Unpinning makes content eligible for collection, not immediate or global deletion.
The backend credential still cannot run `repo/gc` or change configuration; automatic
GC is internal to the daemon. See the pinned
[storage settings](https://github.com/ipfs/kubo/blob/v0.43.1/docs/config.md#datastorestoragemax)
and [GC implementation](https://github.com/ipfs/kubo/blob/v0.43.1/core/corerepo/gc.go).

Enable optional monitoring without starting backend/Caddy:

```bash
docker compose --profile monitoring up -d --wait kubo prometheus
docker compose exec prometheus wget -qO- 'http://127.0.0.1:9090/api/v1/targets'
docker compose exec kubo sh -c 'df -h /data/ipfs; du -sh /data/ipfs'
# Stop only the monitoring service, keeping node/application/data intact:
docker compose --profile monitoring stop prometheus
```

When tearing down a monitoring-enabled project, include `--profile monitoring`
with `down` so it also selects the monitor; omit `--volumes` to retain data.

The digest-pinned Prometheus service scrapes Kubo's native
`http://kubo:5001/debug/metrics/prometheus` every 30s. This native debug endpoint is
outside command-RPC authorization: scraping needs **no backend token**. Prometheus
receives no RPC secret and joins only the trusted `content_network`; neither its UI
nor Kubo's API/metrics has a published host port or Caddy route. Docker/network
administrators remain trusted. Inspect via `exec`, not a public proxy. Compute has
no dependency on monitoring. Once started, the scraper continues when Kubo is down.
Prometheus history uses its own named volume with 7-day/512MB retention targets;
WAL/compaction overhead means these are not hard filesystem limits either.

Basic operator alert notes (no Alertmanager/notification delivery is installed):

- `up{job="kubo"} == 0` for 2 minutes: inspect node health/logs and disk space.
- `sum(rate(ipfs_fsrepo_datastore_put_errors_total{job="kubo"}[5m])) > 0`:
  investigate datastore write failures, including a full disk.
- Monitor the **filesystem hosting kubo_data** separately: warn at 80% used,
  critical at 90%, and size StorageMax well below available capacity. The pinned
  native exporter does **not** provide an `ipfs_repo_size` or filesystem-free-space
  gauge. `df`/`du` above are manual checks, not automated Prometheus disk alerts;
  wire existing host monitoring or a filesystem exporter before production. With
  Docker Desktop, monitor the VM allocation and outer host disk as well.
- A full disk is not fixed by repeatedly running GC when pins dominate. Stop new
  publications, expand storage or intentionally review/unpin expendable artifacts;
  retain MongoDB job results. Never delete the deployment volume as a cleanup step.

Checks require Python 3.10+ (via uv) and Docker Compose with `up --wait` support:

```bash
uv run --no-project python -m unittest discover -s scripts -p 'test_kubo*.py' -v
uv run --no-project python scripts/smoke_kubo.py
# Also start a disposable Prometheus and prove scrape success + node-outage detection:
uv run --no-project python scripts/smoke_kubo.py --monitoring
```

The first command checks deployment configuration without starting containers.
The optional live smoke test extracts only Kubo into a uniquely named temporary
project, ignores project `.env` values, uses random host ports and runs **offline**.
It generates temporary test-only RPC credentials and checks health/profile,
protected RPC denial (anonymous, wrong token, forbidden admin commands), successful
authorized add/cat, loopback read-only gateway, matching bytes/CIDs, persistence,
real token rotation/revocation, secret-free node/health logs and fail-closed startup
without a secret. It inspects only its disposable config in memory, never prints
it, and attempts to remove only its own containers/network/volume, including on failure.
If cleanup also fails, it reports the disposable project label without replacing
the original error. Command failures identify the operation without dumping
possibly sensitive output. It needs no backend dependencies or private data;
its fixtures are harmless public text and a deterministic 2MiB binary DAG. The
storage test uses a **disposable 1MB target/1s GC interval**: it proves an oversized
pinned DAG remains readable, then unpins it and waits for automatic reclamation
while a separate pin survives. Production defaults are not reduced. `--monitoring`
also checks `up{job="kubo"}=1`, an unpublished monitoring UI, and `up=0` after node
shutdown. It never runs GC against an existing deployment.

The normal service is **online**: IPFS is public content-addressed networking,
not confidential storage. Never add private data expecting the CID to be secret.
Native authentication adds defense beyond unpublished RPC; it does not make
Docker administration or public IPFS content confidential. The typed async
[Python RPC client](documentations/guides/backend-features.md#kubo-rpc-client) supports content writes,
pin management and CAR imports with bounded requests and safe errors (#61).
Optional circuit-run provenance publishing and CID-verified gateway reads are
documented in the backend. Storage-adapter integration and production hosting
remain separate work.

</details>

## Documentation

Long-form documentation lives in the **[QMeshPy/documentations](https://github.com/QMeshPy/documentations)** repository. Start with its [START_HERE](https://github.com/QMeshPy/documentations/blob/main/START_HERE.md) page.

The repository is also checked out as a git submodule at [`documentations/`](documentations). After cloning, run `git submodule update --init` to fetch it; the submodule is a pointer to a specific commit, not a copy of the docs.

| I want to... | Read |
|---|---|
| Contribute code | [Repository context](documentations/repository/CONTEXT.md), then [ARCHITECTURE](https://github.com/QMeshPy/documentations/blob/main/ARCHITECTURE.md) |
| Understand the system design | [ARCHITECTURE](https://github.com/QMeshPy/documentations/blob/main/ARCHITECTURE.md), [design](https://github.com/QMeshPy/documentations/blob/main/design.md), [requirements](https://github.com/QMeshPy/documentations/blob/main/requirements.md) |
| Work on the frontend | [Frontend setup](frontend/README.md), [design notes](documentations/repository/frontend/DESIGN.md) |
| Deploy it | [Current configuration](documentations/guides/environment.md), [earlier deployment manual](documentations/repository/DEPLOYMENT-MANUAL.md), [Lightsail notes](https://github.com/QMeshPy/documentations/blob/main/LIGHTSAIL-DEPLOYMENT.md) |
| Read the research | [Paper draft](https://github.com/QMeshPy/documentations/blob/main/research/RESEARCH_PAPER_DRAFT.md), [math appendix](https://github.com/QMeshPy/documentations/blob/main/research/MATHEMATICAL_APPENDIX.md), [scaling strategy](https://github.com/QMeshPy/documentations/blob/main/research/QUANTUM_SCALING_STRATEGY.md) |
| Reproduce the benchmarks | [Implementation notes](https://github.com/QMeshPy/documentations/blob/main/technical/IMPLEMENTATION_NOTES.md), [benchmark results](https://github.com/QMeshPy/documentations/blob/main/technical/BENCHMARK.md), and the scripts in `backend/scripts/` |
| Understand the finance use case | [Financial modeling foundations](https://github.com/QMeshPy/documentations/blob/main/FINANCIAL_MODELING_FOUNDATIONS.md) |
| See where the project is going | [Future roadmap](https://github.com/QMeshPy/documentations/blob/main/FUTURE_ROADMAP.md) |

---

## Contributing

1. Fork the repo and create a feature branch.
2. Read [CONTEXT.md](documentations/repository/CONTEXT.md). The Trio/asyncio bridge and event-sourced persistence have constraints that aren't obvious.
3. Run the [development checks](#development-and-checks) and tests covering your change. Run `bun run build` in `frontend/` before opening a frontend PR.
4. Keep changes surgical: match the existing style and don't refactor adjacent code.

---

## Updated setup and configuration

Start here to run your first circuit or finance experiment. The basic setup uses
MongoDB and local simulated workers; add the console for an interactive view of
jobs, peers, and results.

### Start locally

You need **Python 3.12 or 3.13**, [uv](https://github.com/astral-sh/uv), and a running
MongoDB. Add Bun for the browser console. Node 22 is needed for the optional Toju
payment worker. Local circuit and CSV finance work needs no PostgreSQL, cloud LLM,
wallet, or storage account.

```sh
git submodule update --init documentations
# Fresh checkout only: preserve any existing .env files.
cp -n backend/.env.example backend/.env
cd backend
uv sync --locked
make run
```

The example binds the API to loopback and starts one embedded worker. Open [API docs](http://127.0.0.1:8081/docs) or check [readiness](http://127.0.0.1:8081/api/v1/ready). Start MongoDB before the API. Ports 8081, 4011, and 4021 must be available; the launcher never kills other processes or deletes peer data.

For the console, in a second terminal:

```sh
# From the repository root
cp -n frontend/.env.example frontend/.env.local
cd frontend
bun install --frozen-lockfile
```

Fill these settings before starting the frontend:

| Setting | How to obtain it |
| --- | --- |
| `BETTER_AUTH_SECRET` | Generate with `openssl rand -hex 32`; save in `frontend/.env.local`. |
| `AGENT_AUTH_BRIDGE_SECRET` | Generate a second value the same way; put the identical value in **both** `frontend/.env.local` and `backend/.env`. |
| `RESEND_API_KEY`, `OTP_EMAIL_FROM` | Create a sending key and verified sender in Resend. See the [credential setup guide](documentations/guides/environment.md#minimal-native-setup). |
| MongoDB URI and database | Local defaults work with Mongo on port 27017. For Atlas or existing data, follow the [database settings](documentations/guides/environment.md#minimal-native-setup). |

Then run `bun run dev` from `frontend`, restart the backend after editing its settings, and open [localhost:3000](http://localhost:3000). The local trial flag skips only the trial gate; email sign-in still applies. Set `QB2_AUTH_REQUIRED=true` before sharing the API; the example's development bypass is for loopback only.

### Which environment file?

| File | Purpose |
| --- | --- |
| `backend/.env` | Native API and worker settings; exported environment variables override it. |
| `frontend/.env.local` | Next.js server settings and public browser values. Avoid a second frontend env file. |
| Root `.env` | Optional Compose deployment only; not used by native development. |

These files have different responsibilities. Do not make their contents identical. Keep all provider credentials server-only; `NEXT_PUBLIC_` settings are embedded in browser builds. The [environment guide](documentations/guides/environment.md) covers precedence, every integration's keys, where to get them, and migration from older settings.

Merged integrations may need credentials you do not have yet. Keep their code and existing deployment settings; configure only the features you need locally. Use the guide to obtain a key, or ask the integration's maintainer for access through your team's secret store. Never copy another contributor's secrets into a PR.

### Optional features

| Feature | Enable when needed |
| --- | --- |
| Molecular research | `cd backend && uv sync --locked --extra pharma`, then `make run`. Without the extra, the API reports that it is unavailable. |
| Agent chat | Configure one supported LLM provider; wallet actions additionally require CDP credentials. [Setup](documentations/guides/environment.md#ai-and-wallet-features). |
| Vault cloud pinning | Configure Pinata or Lighthouse on the frontend server. [Storage settings](documentations/guides/environment.md#storage). |
| Toju agent storage | Node 22, the worker's `npm ci`, and your testnet Toju/CDP setup. [Guide](documentations/guides/toju-storage.md). |
| Algorand x402 / Stripe | Off by default. [Payment configuration](documentations/guides/environment.md#payments-and-chains). |
| Kubo and monitoring | Optional Compose profiles. [Content-node guide](documentations/guides/content-node.md). |

`uv run` synchronizes the selected extras: use `uv run --locked --extra pharma ...` for chemistry, or `make run` to use the installed virtualenv. Do not mix pip installs with the locked uv environment.

### Docker deployment

Compose deploys the backend and Caddy. Host the frontend and MongoDB separately. Native development above is the shorter local path.

```sh
cp -n .env.example .env
# Fill root .env: domain, Mongo URI, auth bridge, and frontend origin.
docker compose up -d --build backend caddy
# Optional content node (set KUBO_RPC_SECRET first):
docker compose --profile storage up -d kubo
```

Container API port 8080 is internal to Caddy; host port 4011 belongs to the backend's peer listener. Kubo RPC 5001 is private. Docker chemistry builds use `docker compose build --build-arg INSTALL_PHARMA=true backend`. Consult [deployment configuration](documentations/guides/environment.md#files-and-precedence) before upgrading an existing deployment.

### Development and checks

```sh
cd backend
uv run --locked pytest tests/unit
# Optional chemistry tests: add --extra pharma before pytest.
cd ../frontend
bun x tsc --noEmit --incremental false
bun run lint
```

Frontend tests that mock modules run in separate Bun processes; see [frontend checks](frontend/README.md). Integration tests can use real databases and external services: run them only against disposable, explicitly configured resources.

### Setup reference

All guides and design notes live in the `documentations` Git submodule; component READMEs stay beside their code.

- [Environment, credentials, upgrades, troubleshooting](documentations/guides/environment.md)
- [Cleanup validation and known limits](documentations/guides/cleanup-validation.md)
- [Moved-document index and previous paths](documentations/repository/README.md)
- [Backend feature reference](documentations/guides/backend-features.md)
- [Architecture](documentations/ARCHITECTURE.md) and [research](documentations/research/RESEARCH_PAPER_DRAFT.md)
- [Frontend architecture and development rules](frontend/README.md#development-rules)

When committing documentation changes, commit inside `documentations` first, then commit the updated submodule pointer in this repository. Existing runtime data and private env files are not migrated automatically.
