# QMeshPy Filecoin bridge

This private Node CLI is the Python backend's single Filecoin SDK boundary. It uses
the official Synapse SDK 2.0.2 and Synapse Core 0.10.3, pinned by `package-lock.json`.
Install with `npm ci --ignore-scripts`, then run `node bridge.mjs`. Node 22 or newer
is required. Send one JSON object on stdin; receive one JSON object on stdout.
`npm test` checks validation, budget rejection, receipt handling and SDK imports.

Only **Calibration (314159)** is supported. The bridge checks the RPC chain before
every operation, signs for Calibration, disables CDN, and never buys tokens or
executes SDK `prepare()` funding transactions (those grant unlimited approvals).
Use faucet tFIL and test USDFC. No deployed custom contract is required.

Environment:

- `QMESH_FILECOIN_PRIVATE_KEY`: dedicated Calibration EVM private key, supplied by
  the operator's secret store; required for writes, never included in output.
- `QMESH_FILECOIN_EXPECTED_ADDRESS`: optional expected agent wallet; writes fail
  if the configured signing key differs. The backend sets this for agent actions.
- `QMESH_FILECOIN_RPC_URL`: HTTPS Calibration RPC, default
  `https://api.calibration.node.glif.io/rpc/v1`.
- `QMESH_FILECOIN_NETWORK`: if supplied, must be `calibration`.
- `QMESH_FILECOIN_JOURNAL_PATH`: optional unique, new file for this command's
  public transaction events. Its parent directory must already exist. The
  backend sets this inside its configured persistent journal directory.

Do not expose this CLI directly to a browser. Authorization, agent policy,
idempotency and durable operation journaling belong to the Python caller. Use a
different signing key for each funded agent. A Base AgentKit wallet does not
automatically become a Filecoin account.

## Upload and retrieve

Upload requires already deposited test USDFC and a finite operator allowance:

```json
{"command":"upload","data_base64":"...","copies":1,"retention_days":7,"max_monthly_usdfc":"0.25","max_lockup_usdfc":"1"}
```

Bytes must be canonical base64, between 127 bytes and 16 MiB. Package small
artifacts in a manifest envelope. `copies` is 1 or 2; `retention_days` is 1–30 and
sets a **funding runway target**, not an automatic deletion or termination date.
Storage remains subject to provider health, available funds and service status.
The bridge reads current upload costs, requires sufficient existing funding,
and rejects cost or existing operator allowances above the supplied limits.
It also reads the contract's current `defaultLockupPeriod` and rejects shorter
operator approvals before storing bytes or signing a commitment. At the current
Calibration deployment, this period is 86,400 epochs (30 days), independently of
a seven-day funding runway target. Small uploads also incur a per-dataset
monthly fee and lifecycle reserve, so their costs are not just per-byte charges.
It stores and commits once per selected provider, without retrying writes or
silently changing providers. Two copies can incur partial success: preserve an
error's transaction hashes and reconcile before attempting any new upload.

Successful receipt:

```json
{"network":"calibration","chain_id":314159,"piece_cid":"bafk...","payer_address":"0x...","sha256":"64 lowercase hex digits","size_bytes":1024,"complete":true,"copies":[{"provider_id":"1","provider_address":"0x...","data_set_id":"123","piece_id":"0","transaction_hash":"0x...","retrieval_url":"https://..."}],"transaction_hashes":["0x..."]}
```

Identifiers are decimal strings, transaction hashes EVM hex strings. The
transaction hash is the SDK's confirmed hash when available, and its receipt
must succeed before the copy is returned. The receipt's PieceCID is a Filecoin
piece commitment, **not an ordinary IPFS CID**.

Key-free download:

```json
{"command":"download","piece_cid":"bafk...","sha256":"...","size_bytes":1024,"provider_address":"0x...","payer_address":"0x..."}
```

Supply at least `provider_address` or `payer_address` from the receipt. Resolution
uses the SDK's registered provider lookup, never a caller-provided retrieval URL.
The response stream is capped at the expected size (maximum 16 MiB) and cancelled
as soon as it exceeds that limit. Retrieval requires HTTPS with a DNS hostname;
literal IP addresses, local hostnames and URL credentials are rejected. Up to
three redirects are followed within the registered provider's same HTTPS origin,
with every target validated; cross-origin redirects and loops are rejected.
The SDK computes the received bytes' PieceCID, and independent SHA256/size checks
must also pass. Output adds `data_base64`, `sha256`, `size_bytes`, `network`, and
`chain_id`. Deployments should apply network egress controls as DNS answers are
outside this URL validation boundary.

## Storage status

```json
{"command":"status","piece_cid":"bafk...","copies":[{"provider_id":"1","data_set_id":"123","piece_id":"0"}]}
```

Returns `observed_block`, `observed_at`, and `copies` with the supplied identifiers
plus `registered`, `live`, `service_end_epoch`, `next_challenge_epoch`,
`payer_address`, and `proof_status`. `registered` checks the exact PieceCID and
piece ID, provider binding and scheduled removals. `proof_status` is
`proven_this_period`, `pending_this_period`, or `unknown`; a pending current
period does not prove that a past proof deadline was missed. RPC/read failures
are errors, never an invented positive status. Reads observe current chain state;
they are not an atomic historical snapshot. PDP possession and successful
application retrieval are separate checks.

## Explicit agent payments

Every monetary value below is a **decimal string in test USDFC**, 18 decimals.
The hard bridge maximum is 10 test USDFC per request and total account funding;
monthly and lockup allowances may not exceed 10 test USDFC. The caller may impose
lower daily/agent budgets. Balance output uses integer base-unit strings.

```json
{"command":"payments","action":"balance","payer_address":"0x..."}
{"command":"payments","action":"deposit","amount_usdfc":"1"}
{"command":"payments","action":"approve","max_monthly_usdfc":"0.25","max_lockup_usdfc":"1","max_lockup_days":30}
{"command":"payments","action":"withdraw","amount_usdfc":"0.01"}
{"command":"payments","action":"revoke"}
{"command":"payments","action":"terminate","data_set_id":"123"}
```

`balance` without a payer uses the configured signer address if present; otherwise
it reports the zero address, so callers should always pass the intended wallet.
`deposit` approves only the exact ERC20 amount needed. `approve` computes a finite
per-epoch rate from the monthly cap and sets a finite lockup amount/period.
`withdraw` can only withdraw unlocked funds. `revoke` prevents new operator
activity; it does not cancel existing rails. `terminate` uses the SDK's direct
wallet path and returns the actual service `end_epoch`; storage can continue
through its lockup period. Renew retention by explicitly depositing more test
USDFC before deficit; no scheduled refill or hidden real-money fallback exists.

## Errors and uncertain writes

Exit code 1 returns:

```json
{"error":{"code":"operation_failed","message":"Filecoin operation failed; inspect recorded transaction hashes before retrying a write","uncertain":true,"transaction_hashes":["0x..."]}}
```

Errors deliberately omit SDK diagnostic strings, keys and signed payloads.
Safe diagnostics include `operation_stage` (`preflight`, `store`, `commit`,
`receipt`, or `payment`), a bounded list of local error class names in
`error_types`, and numeric `http_statuses` when present in the error's cause
chain. These fields never include error messages or request/response bodies.
`funding_required` additionally includes `deposit_needed_base_units`.
An approval with insufficient duration includes `required_lockup_epochs`.
`uncertain:true` can occur with no known hash if a send failed after submission;
**never automatically retry such an operation**. Save the request ID and result
durably and reconcile wallet/provider/on-chain state. Process termination or a
caller timeout during a write must also be journaled as uncertain.
Preflight validation, funding/allowance rejection and RPC failures before any
write-capable SDK call return `uncertain:false` with no transaction hashes.
After provider storage starts or a payment call can submit, failures remain
uncertain even when the provider or RPC returned no hash.
An empty on-chain dataset list does not exclude a signed commitment still
pending at a provider. Do not increase approval limits to retry an uncertain
commitment without reconciling that provider operation or isolating the signer.

When a journal path is configured, the bridge creates it exclusively and appends
NDJSON events with `fsync` before continuing. `{"type":"write_started"}` is
flushed before each write attempt. Every available transaction hash is flushed
as `{"type":"transaction_submitted","transaction_hash":"0x..."}` before
its receipt wait, including the intermediate ERC20 approval within a deposit.
No private keys, signed payloads or request data enter the journal. Existing
files are never reused or truncated. Journal failures before the first write
stop submission; failures after submission remain uncertain. The final stdout
protocol stays one JSON object. Preserve this journal after timeout/process
termination so transaction reconciliation does not depend on process memory.

Depositing can require two transactions: the SDK's ERC20 approval wait defaults
to 180 seconds, followed by a separate deposit with a 120-second receipt wait.
These waits are sequential, plus RPC/simulation time. A slow command is not
evidence that no transaction was sent; use its journal and fresh chain reads.

References: [SDK](https://docs.filecoin.cloud/developer-guides/synapse/),
[upload lifecycle](https://docs.filecoin.cloud/developer-guides/storage/upload-pipeline/),
[payments](https://docs.filecoin.cloud/developer-guides/payments/payment-operations/).
