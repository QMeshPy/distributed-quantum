# Provenance commitments (v1)

This documents issue #4: backward-compatible evidence models, deterministic
commitments, Merkle proofs, circuit-job provenance, a verification endpoint and
run-detail badge. It prepares evidence for #21 but does not submit transactions,
schedule anchor batches, upload files or enable any mainnet.

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
- An odd last node at **each level** is paired with itself.
- A singleton root is its framed leaf hash, not the input bundle digest.
- An empty batch is an error.

Prefixes distinguish leaves from internal nodes. A proof stores the zero-based
`leaf_index`, original `leaf_count`, and bottom-up sibling hashes. The index bits
specify left/right orientation. The verifier checks path length and duplicated
odd siblings. Repeated bundle hashes remain separate positions.

Duplicate-last trees do not independently commit to batch size: some batches
with duplicated trailing leaves share a root. Preserve authoritative batch
metadata if exact cardinality matters; an inclusion proof proves membership,
not the uniqueness or number of records.

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
badge; a manual recheck is available.

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
