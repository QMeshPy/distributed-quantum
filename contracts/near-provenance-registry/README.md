# NEAR provenance registry

An append-only registry for QMesh Merkle roots. It stores roots and public batch
metadata, never the batch's records, access tokens, private content, or CIDs.

The contract pins [near-sdk 5.30.1](https://github.com/near/near-sdk-rs/releases/tag/near-sdk-v5.30.1)
and Rust 1.95.0. That SDK requires NEAR protocol version 85 or newer with these
features; NEAR testnet reported protocol 88 on 2026-11-10.

## Build and check

Run from this directory with Rust/rustup and a native C compiler installed:

```sh
cargo fmt --check
cargo test --locked
RUSTFLAGS='--cfg near' cargo build --locked --target wasm32-unknown-unknown --release
```

The deployable file is
`target/wasm32-unknown-unknown/release/near_provenance_registry.wasm`.
The pinned toolchain file installs the WASM target. `--cfg near` selects the
NEAR host environment, as supplied by `cargo-near` for on-chain builds.

## Interface

Initialize once by calling `new` **from the deployed contract account itself**:

```json
{"publisher_id":"publisher.testnet"}
```

`#[init]` rejects reinitialization, and `#[private]` prevents another account
from claiming an uninitialized deployment. Prefer deploying and initializing
in one transaction. The publisher has no setter.

Only that publisher's immediate call can invoke the payable `anchor` method:

```json
{
  "merkle_root":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "leaf_count":7,
  "hash_profile":"qmesh-provenance-sha256-v1"
}
```

Roots must contain exactly 64 lowercase hexadecimal characters. The leaf count
must be from 1 through 20,000, and the hash profile must match the value above.
Attach NEAR to cover the new entry's measured storage usage multiplied by the
runtime storage price. Excess is refunded to the publisher by a transfer
promise. Insufficient deposits fail the entire call; NEAR rolls back its state
writes. A 0.01 NEAR deposit is a practical starting amount for this fixed-size
metadata, but callers must handle insufficient-deposit errors.

An identical repeat returns the original record, preserving its block height
and timestamp, and refunds the entire attached deposit. Conflicting metadata
fails without replacing the existing entry. There is no removal method.

Anyone can call the view method `get_anchor`:

```json
{"merkle_root":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"}
```

It returns `null` if absent, or this record shape:

```json
{
  "merkle_root":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "leaf_count":7,
  "hash_profile":"qmesh-provenance-sha256-v1",
  "publisher_id":"publisher.testnet",
  "block_height":"42",
  "timestamp_ns":"1700000000000000042"
}
```

Both 64-bit values serialize as decimal strings. A newly registered record emits
one `EVENT_JSON:` log with `standard: "qmesh-provenance"`, `version: "1.0.0"`,
`event: "anchor_registered"`, and `data: [record]`. Repeats emit no new event.

The full-access keys on the contract account can still redeploy its code.
Immutability here means this deployed implementation exposes no mutation of an
existing record; operators must protect and disclose deployment authority.

## Test scope

Unit tests exercise the real registry against the SDK's in-memory NEAR host:
publisher authorization, input boundaries, persistence/JSON/event shape,
measured storage charges, exact/excess deposits, refunds, idempotency, conflict
rejection, and public reads. Initialization guards and atomic rollback are
enforced by the generated WASM entrypoints and NEAR runtime; deployment smoke
checks must exercise those boundaries on-chain.
