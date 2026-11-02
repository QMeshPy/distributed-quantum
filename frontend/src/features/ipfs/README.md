# IPFS / Helia vault (content layer)

Browser-side Helia stores vault circuits and runs as content-addressed JSON in IndexedDB. Sharing a CID with another user only works if they can obtain the block — either from a prior pin sync or via **trustless HTTP gateways**.

## Run → circuit IPLD links (dag-json)

New run records are encoded with `@helia/dag-json`. The `circuitCid` field is a **real IPLD CID link** to the circuit record, so one root CID covers the run and its circuit (first step toward the provenance DAG).

- Field name stays `circuitCid` (same CID string provenance stores under `storage[].cid` / StorageReference).
- Readers still accept **legacy string-valued** `circuitCid` records.
- Sharing a completed run from the run detail page stores the OpenQASM as a circuit block when needed, then links it from the run.

```bash
bun test:vault-run-link
```
## Publish a circuit — Lab → New Run

Location: `/runs/new` (`RunCreateForm`) — **Publish circuit to VAULT**.

Publishes a Helia JSON record with:

`name`, `description`, `qasm`, `qubitCount`, `gateCount`, `author`, `publishedAt`, `tags`

After publish, the same **Pin** flow used for runs appears. The circuit shows up in the local Circuit Library and can be re-opened by CID. The share button is loaded with `next/dynamic({ ssr: false })` so Helia never runs on the server.

## Open any CID — `/vault/cid/[cid]`

- Paste a CID on `/vault/cid`, or open a shared link `/vault/cid/<cid>`.
- Helia is configured with the `@helia/block-brokers` **trustless-gateway** broker and `@helia/routers` **httpGatewayRouting**.
- If the block is missing locally, the resolver fetches `application/vnd.ipld.raw` from the gateway list, **re-hashes the bytes against the CID**, caches the block in the IDB blockstore, then decodes and schema-checks the vault record.
- Invalid CIDs and unreachable gateways surface distinct error messages.

## Gateway configuration

```bash
# frontend/.env.local
NEXT_PUBLIC_IPFS_TRUSTLESS_GATEWAYS=https://gateway.pinata.cloud,https://trustless-gateway.link,https://4everland.io
```

Omit the variable to use the defaults (Pinata first). Fetches use `?format=raw` so the
returned bytes can be verified against the CID (Pinata path responses alone are not enough).

## Privacy

Trustless gateways see every CID you request (and your client IP). Prefer a self-hosted or otherwise trusted gateway list for sensitive shared results. Verification against the CID still prevents a gateway from substituting a different payload for that CID.

## Ground rules (content layer)

- No secrets in the repo.
- Content-layer failures must never block or discard quantum execution.
- Tests and docs ship with every PR.

## Tests

```bash
bun test:vault-cid
bun test:vault-run-link
bun test:vault-circuit
```
