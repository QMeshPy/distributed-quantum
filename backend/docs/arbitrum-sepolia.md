# Arbitrum Sepolia wallets and escrow (issue #15)

Arbitrum Sepolia (`eip155:421614`, alias `arbitrum-sepolia`) is a registry wallet
network alongside Base Sepolia. It reuses the EVM AgentKit / CDP path.

## Registry

| Field | Value |
| --- | --- |
| Chain id | `eip155:421614` |
| Alias | `arbitrum-sepolia` |
| USDC | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` (Circle / Aave underlying) |
| Aave V3 Pool | `0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff` |
| Explorer | https://sepolia.arbiscan.io |
| Public RPC | `https://sepolia-rollup.arbitrum.io/rpc` |
| RPC override | `QB2_ARBITRUM_SEPOLIA_RPC_URL` |

Sources: [bgd-labs/aave-address-book `AaveV3ArbitrumSepolia`](https://github.com/bgd-labs/aave-address-book).
CDP lists `arbitrum-sepolia` with `sendTransaction` and `requestFaucet`.

## Wallets

- Process default remains Base Sepolia (`NETWORK` unset).
- `POST /api/v1/wallet/create` accepts optional JSON `{"network":"arbitrum-sepolia"}`.
- Balance, transfer, faucet, and history run against the **stored** wallet network.
- Set `NETWORK=arbitrum-sepolia` when the whole deployment should default to Arbitrum.

## Escrow

Aave V3 supply / withdraw use the registry `aave_pool_address` and USDC. No
direct-transfer fallback is required on this testnet because the pool exists.

## x402

Advertising Arbitrum in payment challenges belongs to multi-network x402 (#5).
Until that ships, the registry entry is the source of truth for chain metadata;
do not hard-code Arbitrum only inside the Algorand gateway.

## Tests

```bash
uv run --no-sync pytest tests/unit/test_chain_registry.py tests/unit/test_chains_api.py -q
```
