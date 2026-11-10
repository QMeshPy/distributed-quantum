# NEAR testnet provenance registry

Issue #141 adds an optional publisher-controlled registry for existing
`qmesh-provenance-sha256-v1` Merkle roots. NEAR AI inference uses its separate
Cloud API. An anchor records evidence integrity/publication, not scientific
correctness or proof of quantum hardware execution.

## Configuration

Set the trusted registry/publisher on the backend and operator workstation:

```env
QB2_NEAR_REGISTRY_CONTRACT=qmesh-provenance-20261110.testnet
QB2_NEAR_REGISTRY_PUBLISHER=qmesh-provenance-20261110.testnet
QB2_NEAR_RPC_URL=https://rpc.testnet.near.org
```

Leave the account settings unset to disable NEAR verification. Existing EVM
configuration/scheduling stays intact. Only named `.testnet` accounts are accepted;
the RPC must report `testnet`. No NEAR private key enters the backend or browser.
Keep the operator key in the official NEAR CLI keychain, outside source control.

## Build and deploy

The published testnet instance is
[`qmesh-provenance-20261110.testnet`](https://testnet.nearblocks.io/address/qmesh-provenance-20261110.testnet).
Its public [deployment metadata](../../contracts/near-provenance-registry/deployments/testnet.json)
records the CI artifact hash, deployment transaction and finalized smoke checks.
The downloadable fixture bundle and manifest are in that same directory.

See `contracts/near-provenance-registry/README.md` for the pinned toolchain,
tests, WASM build and atomic initialization. The `NEAR provenance` GitHub workflow
tests and uploads the WASM for the exact reviewed commit.

Only the configured publisher may call `anchor`. Records contain root, leaf count,
hash profile, publisher and registration block/time. Identical calls return the
original record; conflicts are rejected. The deposit pays measured storage;
excess is refunded. The account's full-access key can upgrade the contract, so
this release trusts that operator and the configured RPC. It is not a light client.
Keep the original registry configuration to verify historical records after
migration; changing contract/publisher settings can invalidate those checks.

## Publish committed evidence

From `backend/`, with project dependencies and `QB2_MONGODB_URI` configured:

```sh
uv run --frozen python scripts/near_provenance.py prepare \
  --bundle-id provenance-YOUR_RUN_ID --output near-batch.json
```

Repeat `--bundle-id` to select up to 20,000 bundles. Preparation checks their
existing content commitments and writes an ordered manifest of IDs/hashes only.
Preserve it unchanged. The command prints the exact contract JSON arguments.
Publish using those arguments in place of `ARGS_JSON`:

```sh
near contract call-function as-transaction qmesh-provenance-20261110.testnet \
  anchor json-args 'ARGS_JSON' prepaid-gas '30 Tgas' attached-deposit '0.01 NEAR' \
  sign-as qmesh-provenance-20261110.testnet network-config testnet sign-with-keychain send
```

Use the returned transaction ID:

```sh
uv run --frozen python scripts/near_provenance.py verify near-batch.json --tx-hash TX_HASH
uv run --frozen python scripts/near_provenance.py attach near-batch.json --tx-hash TX_HASH
```

`verify` needs public RPC and the manifest, not MongoDB or a key. `attach` reloads
all commitments before writing. Verification requires a successful `FINAL`
transaction from the trusted publisher to the trusted contract, exactly one
`anchor` action with the expected root/count/profile, successful receipts and a
matching finalized `get_anchor` result. Unknown/non-final transactions and outages
are never accepted. Historical transactions require an RPC retaining that history.
The linked registry execution receipt must also return the same record as the
finalized view; arbitrary successful receipts are insufficient. Independent RPC
reads run concurrently within the existing verification report's I/O budget.

Attachment appends positional `near:testnet` proofs, preserving storage refs,
other anchors and EVM scheduler claims. Concurrent changes abort; rerunning safely
skips identical attached proofs and finishes a partial batch. Retry the same
transaction after an attachment failure instead of paying for another publication.

The existing authenticated `/api/v1/provenance/{bundle_id}/verify` endpoint and run
UI check NEAR references through the existing generic verification model. Downloaded
bundles can also be checked independently:

```sh
uv run --frozen python scripts/verify_anchor.py bundle.json
```

Add `--sender EVM_ADDRESS` for EVM references in mixed-chain bundles.

## Checks

```sh
uv run --frozen pytest tests/unit/test_near_provenance.py \
  tests/unit/test_provenance.py tests/unit/test_provenance_verification.py \
  tests/unit/test_provenance_api.py tests/unit/test_provenance_anchor.py -q
```

Tests use scripted RPC and in-memory persistence. Public testnet deployment/smoke
receipts are recorded with the contract. Smoke evidence is explicitly a fixture,
not an application research run.
