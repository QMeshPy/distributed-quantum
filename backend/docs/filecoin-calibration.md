# QMeshPy + Filecoin (Calibration)

Filecoin stores the research bytes needed after a worker disappears. NEAR remains
the independent commitment registry. This integration is opt-in and accepts only
Calibration chain ID **314159**. It uses faucet test FIL and test USDFC; it cannot
switch to mainnet or purchase tokens. No new custom Filecoin contract is deployed.

## What is connected

| Capability | Product path |
| --- | --- |
| Experiment preservation | Explicit completed-circuit export includes inputs, result, execution plan, provenance and a hashed file manifest. The typed Filecoin receipt is attached without changing the existing provenance commitment. Arbitrary research packages can use the artifact endpoint or CLI. |
| Shared datasets | Finance accepts an immutable CSV receipt and verifies downloaded bytes before building the portfolio. Pharma tasks load a versioned dataset before dispatch; existing workers receive the verified input JSON. |
| Task recovery | Pharma VQE task batches checkpoint completed outcomes. A fresh coordinator retrieves the checkpoint, checks namespace/input/group bindings, and executes only unfinished tasks. This does not resume inside an optimizer iteration. |
| Storage checks | Status reports observed on-chain dataset/piece registration, service state and PDP period evidence separately from a fresh download and checksum check. Pending possession evidence is not labelled proven. |
| Agent retention funding | Operators configure a distinct Calibration wallet and finite budget for each existing agent. Its owner can deposit test USDFC, approve bounded storage, replenish funding, revoke, terminate a dataset, or withdraw available funds. Existing Base AgentKit wallets are not silently reused. |
| Filecoin + NEAR verification | A fresh process retrieves the archived bytes and recomputes input/result/bundle commitments, then checks the existing finalized NEAR registry anchors. Storage proofs establish possession; they do not establish compute quality. |

Uploads require explicit `publish_publicly:true`. These endpoints publish plaintext
public research; do not send confidential inputs. Normal computation and existing
Kubo pinning continue when Filecoin is disabled. Completion, confirmed storage,
successful retrieval, and PDP proof observations are distinct states.

## Configure

Install Node 22+ and the pinned bridge dependencies:

```sh
cd services/filecoin
npm ci --ignore-scripts
```

Use an existing QMeshPy agent ID and its actual owner ID. Provision a dedicated
Calibration key through the deployment's secret store; never commit it:

```text
QMESH_FILECOIN_ENABLED=true
QMESH_FILECOIN_CHAIN_ID=314159
QMESH_FILECOIN_RPC_URL=https://api.calibration.node.glif.io/rpc/v1
QMESH_FILECOIN_AGENTS={"agent-id":{"owner_id":"user-id","key_env":"AGENT_A_FILECOIN_KEY","address":"0x...","max_monthly_usdfc":"0.25","max_lockup_usdfc":"1","max_deposit_usdfc":"1","retention_days":7}}
AGENT_A_FILECOIN_KEY=<secret-store value>
```

MongoDB is required for operation journals, task records and coordinator leases.
Set `QMESH_FILECOIN_JOURNAL_DIR` to a persistent directory for the bridge's public
transaction events; the local default is `tmp/filecoin-journal`. Events are flushed
before confirmation waits so a killed subprocess does not erase known transaction hashes.
The SDK path is resolved relative to the repository; deploy `services/filecoin`
alongside `backend`. The bridge checks the RPC chain and expected wallet before
signing. Agent ownership is checked against both configuration and `ai_agents`.

The monthly and lockup values are finite on-chain allowance ceilings. The deposit
ceiling applies per request; the bridge also limits the funded account to 10 test
USDFC. `retention_days` requests funded runway, not automatic deletion or a fixed
expiry guarantee. Monitor funding and provider status; renew with an explicit
deposit. Ending a dataset affects all its pieces, so review its contents first.
The current storage contract requires a 30-day operator lockup approval even
when the requested funding runway is seven days. The bridge reads that requirement
before publishing and rejects shorter approvals. Small datasets also incur a
fixed service fee and lifecycle reserve; the default limits cover a small demo,
not an unlimited archive.

## Vault interface

Open **My Vault → Filecoin** (`/vault/filecoin`) while signed in. The page lists
only the current owner's configured agents and recent operations. Archive a
completed circuit run, publish a dataset, inspect saved receipts, check retrieval
and PDP status independently, or verify an experiment's NEAR commitments.
The same page provides explicit funding controls and task resume; finance links
to the receipt-based CSV import. Publication and payment actions show a
confirmation before submission. An interrupted request retains its operation ID
in the browser so the user can inspect its durable backend record before writing
again. Private keys remain in the backend's configured secret store.

## API sequence

All routes use the existing authenticated backend identity:

1. `GET /api/v1/filecoin/agents/{agent_id}/balance`.
2. `POST /api/v1/filecoin/payments` with `agent_id`, unique `operation_id`,
   `action:"deposit"`, `amount_usdfc:"1"`; then another operation with
   `action:"approve"`. Approval limits come from server policy, not the request.
3. `POST /api/v1/filecoin/runs/{run_id}/archive` with `agent_id`, `operation_id`,
   `publish_publicly:true`; or `/artifacts` with the same fields and `data_base64`.
4. `POST /api/v1/filecoin/retrieve` or `/status` with the returned receipt.
5. For finance, `POST /api/v1/finance/filecoin-submit` with a CSV `receipt` and
   normal portfolio configuration. Bytes must be the CSV itself, not a package.
6. For pharma, upload bytes produced by `create_dataset("pharma.vqe", inputs)`;
   call `POST /api/v1/filecoin/tasks/{run_id}/run` with `agent_id`, `dataset`
   receipt and `publish_publicly:true`. Poll `GET /api/v1/filecoin/tasks/{run_id}`.
   After an interruption, submit the same run ID and dataset to resume. Active
   leases cannot be reclaimed; expired leases can. Checkpoints are saved per
   successful task, using the same agent's finite allowance.

Files are limited to 16 MiB and the SDK requires at least 127 bytes. Wrap smaller
research artifacts in a package. The current public task endpoint bounds VQE
problem sizes and batch length; it uses the existing real pharma kernel.

## Independent verification

```sh
python backend/scripts/filecoin.py download receipt.json downloaded-package.json
QB2_NEAR_REGISTRY_CONTRACT=qmesh-provenance-20261110.testnet \
QB2_NEAR_REGISTRY_PUBLISHER=qmesh-provenance-20261110.testnet \
python backend/scripts/filecoin.py verify receipt.json
python backend/scripts/filecoin.py status receipt.json
```

`download` needs only public receipt metadata and registered provider lookup;
it ignores any caller-provided retrieval URL. It validates length, SHA256 and
PieceCID. `verify` additionally requires the experiment package schema and reports
each commitment and anchor check. Missing NEAR configuration remains unavailable.

`pack DIRECTORY OUTPUT --identity RUN_ID` creates a manifest package;
`upload INPUT RECEIPT --publish-publicly` publishes it using an operator-supplied
Calibration key. The CLI uses an exclusive `.intent` file; it does not overwrite
receipts or automatically repeat interrupted writes.

## Interrupted writes and recovery

Every API write records intent before calling the SDK. Repeating a confirmed
operation returns its receipt; reusing its ID for another request is rejected.
A safe preflight rejection releases the agent lock. An uncertain submission keeps
the lock and any known transaction hashes; inspect
`GET /api/v1/filecoin/agents/{agent_id}/operations/{operation_id}` before proceeding.
Never clear a lock solely because a request timed out. An operator must compare
the transaction, account, dataset and piece state, persist recovered evidence,
then resolve the journal. There is no automatic repayment or blind retry.

Task uploads record an exact owner/agent/run scope. Recovery reads the latest
confirmed checkpoint from the operation journal even if the task callback died.
Per-run leases renew while work is active; stale coordinators cannot persist
results. A cancelled local compute thread may finish its current calculation.

## Validation and ecosystem contribution

The tests cover mainnet rejection, finite budgets, corrupted bytes, user ownership,
immutable finance inputs, task restart, grouped tasks, uncertain writes, archive
replay and coordinator leases. CI also tests real Mongo atomic claims. Live proof
results, when available, are recorded separately with public transaction links.

The reusable package format and verifier are Apache-2.0 project code. They make
research artifacts useful to Filecoin clients outside QMeshPy and make actual
retrieval reliability measurable. Testnet activity is development evidence, not
mainnet revenue or guaranteed grant eligibility.

Primary references: [Synapse](https://docs.filecoin.cloud/developer-guides/synapse/),
[PDP](https://docs.filecoin.cloud/core-concepts/pdp-overview/),
[Filecoin Pay](https://docs.filecoin.cloud/core-concepts/filecoin-pay-overview/),
[Calibration](https://github.com/filecoin-project/testnet-calibration).
