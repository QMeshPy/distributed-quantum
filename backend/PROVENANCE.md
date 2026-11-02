# Provenance commitments (v1)

This documents issue #4: backward-compatible evidence models, deterministic
commitments, Merkle proofs, circuit-job provenance, a verification endpoint and
run-detail badge. It prepares evidence for #21 but does not submit transactions,
schedule anchor batches, upload files or enable any mainnet. #21 adds anchoring:
see [Anchor transactions](#anchor-transactions-21).

Provenance proves integrity of a recorded result, **not** execution on quantum
hardware, scientific correctness, peer honesty, or availability of stored data.
An anchor receipt is evidence to check, not a successful verification result.

## Canonical JSON

`provenance.hashing.canonical_json` accepts JSON primitives: null, booleans,
integers, finite floats, strings, lists and dictionaries with string keys.
It sorts keys by Unicode code point, preserves array order and Unicode text,
uses UTF-8, emits no insignificant whitespace, and applies Python's `json.dumps`
string escaping and number rendering. Unicode is not normalized. Lone surrogate
characters cannot be encoded as UTF-8 and are rejected.

This is an explicit **Python JSON profile, not RFC 8785/JCS**. In particular,
`1`, `1.0` and `-0.0` retain their distinct Python JSON representations, and
exponent formatting may differ from JavaScript. NaN and infinities are rejected.
`Decimal` is rejected: producers must supply a documented decimal string instead.
Oracle values are strings for the same reason. Bundle summary and event payloads
are validated before Pydantic JSON conversion so it cannot silently convert
non-finite floats to null, Decimal to strings, or non-string keys to strings.
Other languages must reproduce
these bytes, not simply sort keys and use their default JSON serializer.

`hash_json(value)` is lowercase hex SHA-256 of these canonical bytes. Hashes are
64 lowercase hex characters, without a `0x` prefix.

`bundle_hash(bundle)` hashes this envelope:

```json
{"profile":"qmesh-provenance-sha256-v1","bundle":{}}
```

Replace the empty object with the Pydantic JSON-mode dump of the frozen v1 field
set, including defaults: `bundle_id`, `workflow_run_id`, `workflow_definition_id`,
`owner_user_id`, `events`, `artifact_refs`, `peer_log_refs`, `summary`,
`is_publishable`, `created_at`, `input_hash`, `plan_id`, `fragment_result_hashes`
and `oracle_refs`. **`storage` and `anchors` are excluded.** Future optional model
fields are not silently added to v1 commitments. Nested typed fields are frozen too:
events include `event_id`, `workflow_run_id`, `kind`, `actor_peer_id`, `actor_user_id`,
`payload`, and `occurred_at`; oracle references include `provider`, `feed`, `round_id`,
`value`, and `observed_at`. All contents of free-form event payloads and the summary
remain committed. Timestamps use Pydantic's JSON representation. Use timezone-aware UTC timestamps consistently;
timestamps are not normalized between different timezone representations.
Storage/anchor attachments can change after hashing without changing the
commitment. They are not themselves authenticated by that commitment: retrieval
must verify the content and anchoring must verify the transaction separately.
All listed v1 fields, including events, summary and publication status, are committed.
Freeze the evidence snapshot before batching; changing it requires a new hash.
Do not add a self-hash to the committed payload.

Future changes to serialization, committed fields or tree construction require a
new profile and backwards-compatible verification. Do not silently change v1.

## Ordered Merkle tree

`MerkleTree` accepts an ordered, non-empty sequence of bundle digests. Preserve
that order and batch size with the batch record; do not sort or deduplicate.

- Leaf: `SHA256(0x00 || raw_32_byte_bundle_digest)`.
- Parent: `SHA256(0x01 || raw_left_hash || raw_right_hash)`.
- An odd last node at **each level** is promoted unchanged, without hashing it again.
- A singleton root is its framed leaf hash, not the input bundle digest.
- An empty batch is an error.

Prefixes distinguish leaves from internal nodes. A proof stores the zero-based
`leaf_index`, original `leaf_count`, and bottom-up real siblings. Promoted levels
add no synthetic sibling. Index and level width determine left/right order and
when to consume a sibling. The verifier checks the position-dependent path length
before hashing untrusted siblings; extra or missing siblings are rejected.
Repeated bundle hashes remain separate positions.

This uses the non-empty tree shape and audit paths from
[RFC 6962 sections 2.1–2.1.1](https://www.rfc-editor.org/rfc/rfc6962#section-2.1),
not the full Certificate Transparency protocol (empty batches remain invalid).
Promotion was chosen during pre-merge v1 review, replacing duplicate-last before
freezing the profile for #21. It removes the duplicate-padding ambiguity where
`[A,B,C]` and `[A,B,C,C]` have the same root. It does not deduplicate batches or
prove that recorded results are honest. Preserve ordered batch metadata and size.
An individual inclusion proof cannot authenticate the supplied size independently:
opaque siblings conceal their subtree sizes. #21 must authenticate batch metadata
alongside the root if exact cardinality is claimed.

Roots/proofs from the earlier, unmerged duplicate-last draft are not interchangeable
with this construction. Regenerate draft fixtures/batches; do not reinterpret old
anchored roots. Any change after this profile is released requires a new profile.

## Circuit-job integration

`CircuitJobService.process` creates a provenance bundle after computing the full
result and before saving the completed run. It commits to the input snapshot,
plan ID, ordered serialized fragment results and the entire final result. The
summary stores `result_hash`, not another copy of the potentially large statevector.
The separate MongoDB `content_hash` field records the bundle's initial digest.

The job detail response exposes `provenance_bundle_id`; historical runs without
one remain readable and display an unverified/no-bundle state. New circuit runs
fail rather than report completion if provenance persistence fails. An existing
matching commitment is reused, not overwritten or stripped of its anchors. Retries
preserve the original JSON timestamp: BSON dates lose sub-millisecond precision
and timezone representation. A unique `bundle_id` index arbitrates concurrent
writers; losing writers re-read and validate the winner, including its stored
payload, instead of overwriting evidence. This
is not a cross-document MongoDB transaction or an exactly-once execution guarantee;
concurrent job processing and crash recovery still follow the existing job runtime.
Automatic generation is scoped to circuit jobs, not finance/pharma jobs.

### Publishing bundles to Kubo

When `KUBO_RPC_SECRET` is set (see the Kubo section of the README), the app wires a
`KuboBundlePublisher` into `CircuitJobService`. Once the completed run and its
bundle are saved, the publisher adds the bundle's canonical JSON to the platform
node, pins it, and appends `StorageReference(backend="kubo", cid=...)` to the stored
bundle. Storage locations are excluded from `bundle_hash`, so attaching one does not
change the commitment.

- **Best effort.** Any failure (Kubo down, bad config, oversized bundle, a CID that
  does not match the uploaded bytes) is logged by exception class only and never
  fails or alters the run. The run records `output_snapshot["provenance_publication"]`
  as `{"status": "published", "cid": ...}` or `{"status": "unpublished"}`. Without
  a Kubo credential nothing is attempted and the key is absent. A failed
  publication is not retried automatically.
- **What the CID covers.** The uploaded JSON bytes, with `storage` and `anchors`
  emptied so the bytes do not depend on later attachments. It is not the
  commitment: a reader fetches the bytes, checks them against the CID, parses the
  bundle and compares `bundle_hash`.
- **Single block only.** Bundles up to 256 KiB are stored as one raw CIDv1/SHA-256
  block, the shape the verified gateway client can fetch. The publisher computes
  that CID locally and rejects a different answer from Kubo. Larger bundles are
  left unpublished.
- **Public content.** Pinned data is announced on the public IPFS network. Bundles
  carry the run and owner IDs plus hashes of the input and result, not the circuit
  or its counts, but publish them only where that is acceptable.
- **Evidence link.** Set `IPFS_PUBLIC_GATEWAY_URL` to the gateway's browser-facing
  origin (a bare `http(s)` origin, no path, query or credentials) and each reference
  gets a `url`, which the run page shows as an "Open evidence" link. Leave it blank
  when the gateway has no public address: bundles are still published, without a
  link. The private `IPFS_GATEWAY_URL` is never used for links.
- **Verification.** No Kubo storage adapter ships here, so verification reports the
  new reference's `storage_content` check as `unavailable` rather than passed.

## Verification API and UI

`GET /api/v1/provenance/{bundle_id}/verify` requires the existing backend auth
policy. Access is restricted to the associated run's owner or an admin, based on
the run record, not a claimed owner inside the bundle. Missing/inaccessible
records return 404. Corrupt evidence reports failure without exposing payloads.
Responses are private and not cached.

Each check contains `kind` (hash/storage/anchor), `name`, `status`, `message`,
and optional evidence `reference`/`url`. The statuses are:

- `passed`: the stated check actually succeeded.
- `failed`: the evidence contradicted its recorded commitment/anchor.
- `unavailable`: an adapter, historical commitment or external service is missing.
- `not_applicable`: no attachment of this type was recorded.

Hash checks recompute the bundle, input, fragment and final-result commitments
and compare the plan and run identity. If a historical run's result is absent,
its owner can still verify the saved bundle; result/fragment checks report
`unavailable` instead of hiding the bundle behind a 404 or hashing null as a result.
Malformed result data is a failed check, not missing evidence. Creating a new
commitment without a completed result is rejected. Anchor inclusion proofs are checked
locally, separately from transaction confirmation. A valid proof alone does not
establish an on-chain anchor.

Storage and chain adapters are injected into `ProvenanceService`, optionally via
`create_app(provenance_service=...)`. Storage adapters retrieve and validate the
CID-addressed bundle using trusted configuration; the verifier compares its digest.
The existing Toju branch hashes raw exported bytes: that artifact SHA-256 is NOT
`bundle_hash`, which commits to a canonical versioned envelope. A Toju adapter must
validate retrieved artifact bytes separately, then parse the bundle before using
this verifier; no Toju payment/upload behavior is changed here.
Chain adapters must validate the intended chain, destination, successful transaction,
root payload and confirmation policy through #2's chain boundary. Do not scatter
explorer/RPC maps in this service. No concrete external adapters are enabled by
default: references without one report `unavailable`, never invented success.
External I/O has a shared ten-second budget. Timeouts are handled on Python 3.10
as well as newer versions (the asyncio exception differs on 3.10).
Adapters must propagate cancellation
and must not expose keys in evidence URLs or exceptions.

Overall `unverified` means a check failed or none passed. `partially_verified`
means some checks passed but evidence is incomplete or only locally checked.
`verified` requires all applicable checks to pass and at least one successful
storage-content or anchor-transaction check. Even then this does not establish
scientific correctness or protect against an attacker who controls all trusted
sources. Local database hashes alone are not an independent historical witness.

The run page uses TanStack Query through a Next.js BFF, displays per-check states,
and links to recorded HTTP(S) evidence URLs. Set a storage reference's `url` to its
public gateway URL and an anchor's `url` to its public explorer URL when attaching
evidence. No explorer URL is guessed when none was recorded. Unsafe schemes and
credential-bearing links are suppressed. Failed refreshes do not retain a verified
badge; a manual recheck is available. The card appears only for completed runs,
including historical completed runs with no bundle. Window focus does not trigger
external verification lookups. Checks have human-readable labels, and verified
and partially verified states use distinct badge treatments.

The BFF forwards explicit Authorization headers only. It does not turn Better Auth
cookies into backend tokens or manufacture dev bearer tokens. The current browser
flow works with the repo's documented auth-disabled local backend; deployments
requiring backend auth need their existing credential bridge. This feature does
not implement a new authentication system.

## Ethereum handoff (#21)

Ethereum can record this SHA-256 root as `bytes32` in calldata or a contract.
A transaction alone does not prove inclusion: the verifier must recompute the
bundle commitment and proof, then check the intended chain, transaction success,
anchor payload/contract, and confirmation policy through the #2 adapters.

This format is **not OpenZeppelin MerkleProof-compatible**: that convention uses
Keccak and sorted pairs. If on-chain verification is required, explicitly agree
on a new profile or implement the specified SHA-256 positional verifier; do not
reinterpret v1 roots as OpenZeppelin roots. No Keccak mode is shipped here.

`ChainAnchor` stores a chain identifier (use CAIP-2), transaction hash, root,
index, batch size, siblings (`proof`), hash profile and optional explorer `url`. Addresses and transaction
formats are chain-specific and must be checked by adapters, not this schema.
No anchor key, RPC credential or wallet secret belongs in a bundle.

### Anchor transactions (#21)

An anchor is a **zero-value transaction from the anchor account to itself** on a
registry network with the `anchor_root` capability (testnets only; Ethereum Sepolia
in the packaged registry). Its 45-byte calldata is:

| Bytes | Content |
| --- | --- |
| 8 | ASCII `QMSHANC1` |
| 32 | SHA-256 Merkle root (`qmesh-provenance-sha256-v1`) |
| 4 | Batch size, big-endian unsigned |
| 1 | Hash profile: `0x01` = `qmesh-provenance-sha256-v1` |

Putting the batch size in the payload authenticates it together with the root, so a
proof cannot claim a different `leaf_count` for the same transaction. No contract is
deployed; a batch costs 21,780-22,740 gas (measured on a local Prague-rules node, where
the EIP-7623 calldata floor sets the upper value).

A minimal contract emitting an `Anchored(root, size, profile)` event would let anyone
find anchors with `eth_getLogs` without knowing transaction hashes, at the cost of a
deployment and more gas per batch. Bundles already record their transaction hash, so
the self-send is the simpler choice here. One limit applies to both: some RPC nodes
prune old transaction lookups, after which an anchor shows `unavailable` on that node;
use an RPC override with full history to check old anchors.

`chains.anchor.EvmAnchorAdapter.check_anchor` reports `confirmed` only when the
transaction succeeded, came from and went to the configured anchor account, moved no
value, carries exactly the expected payload and is at or below the `finalized` block.
Anything else is `pending`, `not_found`, `failed` or `mismatch`.

`application.anchoring.RegistryAnchorAdapter` implements `AnchorAdapter` for the verify
endpoint. Set `QB2_ANCHOR_NETWORK` (alias or CAIP-2 ID) and the public
`QB2_ANCHOR_SENDER` address to enable it, plus `QB2_ANCHOR_PAST_SENDERS` (comma-separated)
for every account used before a key rotation. The RPC is the network's registry
variable or public endpoint. A confirmed match passes; a mismatch or failed transaction
fails; a pending, missing or unreachable transaction, or an RPC serving another chain,
is `unavailable`, because a missing transaction cannot be told apart from an RPC node
that pruned old history. An unknown, disabled or non-anchoring network stops startup.

Anyone can check a downloaded bundle without a key or database:

```bash
cd backend
uv run --frozen python scripts/verify_anchor.py bundle.json --sender 0xANCHOR_ACCOUNT
```

It recomputes the bundle commitment (and compares any recorded `bundle_hash`), checks
each Merkle proof, then checks the transaction as above. Repeat `--sender` for accounts
used before a rotation. It exits 0 if every anchor passed, 1 if any check failed, and 2
if none failed but a transaction was unavailable. It never prints RPC errors.

### Scheduled anchoring

With `QB2_ANCHOR_PRIVATE_KEY` also set, the backend anchors circuit-job bundles
(`provenance_bundles`) on a schedule. Finance bundles live inside job results and are
not anchored yet. Each run:

1. Takes up to `QB2_ANCHOR_MAX_BATCH` unanchored bundles in creation order. Bundles
   without a `content_hash` are skipped; one whose stored payload no longer matches it is
   marked `unanchorable` once and never anchored.
2. Records the ordered batch and root, claims the bundles (`anchor_batch_id`; repeated
   before signing if a crash interrupted it), then signs one anchor transaction and
   **stores it before broadcasting**.
3. Broadcasts it and waits for the `finalized` block, then appends a `ChainAnchor` (with
   its explorer `url` and inclusion proof) to every bundle in the batch.

A batch moves `prepared -> signed -> submitted -> anchored`, or to `failed`:

- A crash at any step resumes the same batch; a resend is the identical signed
  transaction. Applying anchors is idempotent per transaction hash.
- Anchors are written only after finality, so a reverted or mismatched transaction, or
  one whose nonce another transaction used, marks the batch `failed` and releases its
  bundles for the next batch without touching them. A nonce counts as taken only after
  10 minutes without finding any attempt, so a lagging load-balanced node cannot fail a
  batch that was mined. A transaction the node lost is resent every 5 minutes.
- A transaction still unmined after 30 minutes is replaced at the same nonce with fees
  at least 12.5% higher, up to the fee cap. Every attempt is stored and checked, and
  whichever is mined anchors the batch. If the cap prevents a bump, the batch waits and
  a warning is logged; raise `QB2_ANCHOR_MAX_FEE_GWEI` to clear it.
- A unique index allows one open batch, and a 10-minute lease lets one replica run the
  scheduler at a time. The lease is renewed before every write and broadcast, and each
  batch write must match the batch's revision, so a runner that paused past its lease
  stops instead of overwriting its successor's work.
- Anchors are excluded from `bundle_hash`, so anchoring never changes a commitment.

Runs repeat every `QB2_ANCHOR_INTERVAL_SECONDS` (default hourly), every minute while a
batch waits for finality (about 13-15 minutes on Ethereum), a few seconds after a batch
completes (to clear a backlog) and five minutes after an error. The maximum fee per gas
is capped at `QB2_ANCHOR_MAX_FEE_GWEI` (default 100); if even that cannot be included,
the run waits rather than paying more. Errors are logged by type only, never with RPC
URLs.

**Cost and cadence.** One batch is one 21,780-22,740 gas transaction whatever its size
(up to `QB2_ANCHOR_MAX_BATCH`: default 10,000, at most 20,000 so the batch record stays
well under MongoDB's document limit). Hourly anchoring is 24
transactions and about 0.55M gas a day: 0.0055 ETH a day at 10 gwei, or about 0.0011
ETH at 2 gwei. Sepolia ETH is free from faucets. A bundle waits at most about one
interval plus finality, about 75 minutes by default. A longer interval lowers cost; a
shorter one shortens the wait. A backlog larger than one batch is cleared in back-to-back
batches.

**Anchor key.** Use a dedicated account for anchoring only, never a user, platform or
deployer wallet. Fund it with a small Sepolia balance and refill as needed. Set
`QB2_ANCHOR_SENDER` to its public address and `QB2_ANCHOR_PRIVATE_KEY` privately; startup
fails if they do not match. The key is held only in process memory, is not logged, and
never appears in bundles or responses. To rotate, set the new key and sender and add the
old address to `QB2_ANCHOR_PAST_SENDERS`; older anchors keep verifying. A batch already
signed by the old account finishes with that account: it is checked and its nonce is
read against that account, and it is never replaced by the new key, whose nonces are
unrelated. Keep the old account funded until that batch closes; an unsigned batch is
signed by the new account.

Publishing a bundle to Kubo now pushes its storage reference atomically instead of
saving the whole document, so it cannot overwrite an anchor or claim written meanwhile.

## Compatibility and checks

New bundle fields default to null or empty tuples, so old bundles still load.
`ProvenanceBundleDocument` already stores bundle data in a generic `payload`
dictionary; optional `content_hash` defaults to null on historical documents.
The unique `bundle_id` index is initialized by Beanie. Before deploying to an
existing database, check for duplicate bundle IDs and resolve any ambiguity with
the maintainer while preserving evidence/anchors. Index creation will fail if
duplicates exist; this feature does not automatically delete or merge them. For
example, inspect (do not delete) duplicates with:

```javascript
db.provenance_bundles.aggregate([
  {$group: {_id: "$bundle_id", count: {$sum: 1}}},
  {$match: {count: {$gt: 1}}}
])
```

No backfill of historical commitments is performed, because recreating one during
verification would only bless the current bytes. Store the JSON-mode dump in that
payload and validate it with `ProvenanceBundle` on reading.

Run the focused tests (no network, wallet or MongoDB required):

```bash
uv run pytest tests/unit/test_provenance*.py -q
```

Golden byte vectors, legacy round trips, field validation, batch sizes 1–33,
randomized batches up to 513 leaves checked against an independent reference,
invalid inputs and tampered leaves/roots/proofs are covered there. Timeout tests
exercise the actual shared ten-second external I/O budget and verify that request
cancellation propagates and cleans up in-flight retrievals. A separate
flow test generates real Qiskit statevectors, creates commitments, round-trips
bundles through the actual BSON codec, and verifies proofs after attaching two
chain receipts. Receipts are fixtures, not real transactions. A three-leaf golden
root was independently computed with Node's crypto implementation.

Job tests exercise real circuit-job processing, bundle creation, persistence calls
and HTTP job/verification endpoints with fake execution/database boundaries.
API tests cover ownership, auth, corruption and independent verification outcomes.
They do not replace a live MongoDB or blockchain smoke test.

Opt-in live MongoDB checks use unique temporary databases, drop only those
databases, and refuse non-loopback MongoDB hosts. They skip unless explicitly
configured. From `backend/`, against a disposable local server:

```bash
docker run --rm -d --name qmesh-provenance-live-mongo \
  -p 127.0.0.1:27028:27017 mongo:8.0
QB2_MONGODB_TEST_URI=mongodb://127.0.0.1:27028 \
  uv run pytest tests/live/test_provenance_mongo.py -q
docker stop qmesh-provenance-live-mongo
```

These tests cover real persistence, legacy loads and index initialization,
HTTP access policy, tamper rejection, reloaded timestamp stability, preservation
of attachments, corrupt payloads, eight concurrent writers producing exactly one
bundle, and conflicting writers being unable to overwrite the winner. A duplicate
legacy-ID test confirms that index creation refuses ambiguity without deleting
records. HTTP tests exercise the repo's existing dev-token/local-bypass policy,
not production JWT validation or a Better Auth credential bridge.

Frontend checks, from `frontend/`:

```bash
bun test tests/provenance.test.mjs tests/provenance-proxy.test.mjs
bunx tsc --noEmit
bun run test:proxy
bun run build
```

Frontend tests cover all badge states, stale-error handling, safe evidence links,
response validation and BFF status/auth forwarding. They are rendered-component
and handler tests, not an interactive browser session against live services.
