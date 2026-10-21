# ENS resolution helpers

Part of [issue #22](https://github.com/QMeshPy/distributed-quantum/issues/22) (PR 1: resolution only).

## What this provides

- `EnsService` in `src/services/ens_service.py` — forward resolve (`name` → address for a coin type) and reverse resolve (address → verified primary name).
- HTTP: `GET /api/v1/ens/resolve` and `GET /api/v1/ens/reverse`.
- In-process cache with capped TTL, RPC timeouts, UTS-46 normalization (via `ens`), and mixed-script / homoglyph rejection.
- Failures raise `EnsResolutionError` / HTTP 422 — **never** a guessed address.

## Network mapping

ENS records live on Ethereum L1. The payment network (`NETWORK`, e.g. `base-sepolia`) only selects which L1 to query:

| Payment network | ENS L1   |
|-----------------|----------|
| `*-sepolia` / testnets | Sepolia |
| `*-mainnet`            | Mainnet |

Override with `ENS_NETWORK` / `ENS_RPC_URL` (see `.env.example`).

## Coin types

Callers pass an explicit SLIP-44 / ENSIP-11 `coin_type` (default `60` = ETH). Helper `evm_coin_type(chain_id)` builds the ENSIP-11 value for other EVM chains. When the chain registry (#2) lands, wrap this service with a thin adapter — do not hard-code chain maps here.

## Before sending funds

1. Resolve with `fresh=true` (bypass cache).
2. Show the checksummed address and require explicit user confirmation (PR 2).
3. Persist the **address**, not the name.

## Tests

```bash
cd backend
uv run pytest tests/services/test_ens_service.py -q
```

Unit tests inject a mock ENS client (no RPC). A Sepolia end-to-end check can be added later behind an opt-in env flag once we control a test name.

## Out of scope here

- Wiring `name.eth` into transfer / proposal / agent forms (PR 2).
- Worker `*.qmesh.eth` subname schema (PR 3).
- Contenthash / IPFS (depends on #4).
