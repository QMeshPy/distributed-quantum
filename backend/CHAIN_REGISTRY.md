# Chain registry — Part of #2

The registry lists network metadata and supported operations. Base Sepolia's
existing wallet service now reads token, escrow, and explorer metadata from it.
Ethereum Sepolia remains available for metadata and explorer links only.

## Configuration and identifiers

`src/quantum_backend_v2/chains/registry.toml` ships inside the Python package.
Bootstrap loads and validates it once, before creating persistence and peer runtimes,
then passes the immutable registry to the API. Invalid configuration prevents
startup. Parsing uses `tomllib` or the existing `tomli` dependency on Python 3.10.

Base Sepolia remains the default. In a CAIP-2 ID, `eip155` identifies the
Ethereum-compatible family and the number identifies the network.

| Network | Canonical ID | AgentKit alias | CDP alias |
| --- | --- | --- | --- |
| Base Sepolia | `eip155:84532` | `base-sepolia` | `base-sepolia` |
| Arbitrum Sepolia | `eip155:421614` | `arbitrum-sepolia` | `arbitrum-sepolia` |
| Ethereum Sepolia | `eip155:11155111` | `ethereum-sepolia` | `ethereum-sepolia` |
| Starknet Sepolia | `starknet:SN_SEPOLIA` | — | — |

Starknet Sepolia is a read-only registry entry (`explorer_url`, `verify_transaction`) plus an opt-in session policy. Base USDC funding stays on the Coinbase path. Alias: `starknet-sepolia`. Native token: STRK, 18 decimals. Explorer templates point at Voyager Sepolia. `QB2_STARKNET_SEPOLIA_RPC_URL` overrides the public RPC.

`registry.resolve()` returns the configured default; `registry.resolve(name)`
accepts a canonical ID, legacy alias, or provider alias. An empty, unknown, or
disabled name raises an error rather than silently selecting Base Sepolia.
Matching is exact and case-sensitive. Duplicate IDs and ambiguous aliases across
entries, including provider mappings, are rejected. There is no global active network.

`QB2_CHAIN_REGISTRY_PATH` optionally selects another TOML file through application
settings; unset uses package data. Relative paths use the working directory.
`NETWORK` selects the wallet network by alias or canonical ID. When unset, the
registry default applies; the packaged default remains Base Sepolia. Empty or
unknown values fail startup. Wallet endpoints use an application-scoped service
with the same immutable registry as the public chain endpoint. Marketplace,
proposal, and AI agent API services share this wallet service, including proposal
broadcasts, agent wallet creation, autonomous funding, and escrow release. These
services are initialized lazily per application; their MongoDB clients and the proposal
service’s Bedrock client close on application shutdown. Standalone proposal and
agent callers can inject a wallet service; otherwise each lazily creates and
reuses its own service. Standalone `AgentKitService` callers load these settings
too, or accept an injected registry and explicit network. Injected registries use
their own default, without reading process-wide network selection.

Mainnet entries must have `enabled = false`. Disabled entries cannot be resolved
for operations and are omitted from the public list. Existing wallet records must
resolve to the selected network before balance queries, provider reconstruction,
transfers, escrow operations, or faucet instructions. Mismatches fail instead of
using the same address on a different chain. Stored network aliases and unique
wallet indexes are unchanged; this is not yet multi-network wallet persistence.

## Credentials and operation capabilities

`rpc_env_var` stores an environment-variable **name**, never a URL or key.
`public_rpc_url` is an optional keyless fallback: HTTPS only, with no credentials,
query string or fragment. `chains.rpc.resolve_rpc_url()` uses the variable when it
is set and the public endpoint otherwise. The packaged fallbacks are
`https://sepolia.base.org`, the endpoint AgentKit used before the registry, and
`https://ethereum-sepolia-rpc.publicnode.com`, the endpoint the ENS service uses.

Overrides must be HTTPS, or plain HTTP to `localhost`/`127.0.0.1`/`::1` for a local
node such as anvil. A resolved URL may carry an API key. It is never stored in the
registry, returned by `GET /api/v1/chains` or logged: RPC failures are logged by
exception type only, and configuration errors name the variable, not its value.

Base Sepolia and Arbitrum Sepolia declare `explorer_url`, `create_wallet`,
`get_balance`, `transfer_stablecoin`, `aave_supply`, `aave_withdraw`, and
`faucet_instructions`. The service checks each operation before provider or RPC
calls. Transaction capabilities require explorer metadata; transfer and supply
also require balance queries. Aave operations require an explicit pool address.
Wallet capabilities are limited to CDP/AgentKit networks listed in
`_WALLET_PROVIDER_NETWORKS` in `chains/models.py` (currently Base Sepolia and
Arbitrum Sepolia). See [Arbitrum Sepolia](docs/arbitrum-sepolia.md).

Ethereum Sepolia declares `explorer_url` and `verify_transaction`. Listing its
provider aliases does not enable wallet operations. `verify_transaction` is
read-only and needs no wallet provider, so it is the one RPC capability allowed
outside the Base Sepolia wallet mapping. The explorer adapter and the legacy
`utils.basescan` wrappers perform no network I/O. They validate reference shape,
not checksums, existence, ownership, or transaction success.

`anchor_root` (#21) marks a network that may carry provenance Merkle-root anchors. It
is allowed only on testnets with `verify_transaction`, and it does not use the wallet
provider: anchors come from a dedicated low-balance account, never a user or platform
wallet. Ethereum Sepolia declares it. See
[Anchor transactions](PROVENANCE.md#anchor-transactions-21).

Robinhood Chain Testnet (`eip155:46630`, #18) declares `explorer_url` and
`verify_transaction` only, with no stablecoin. Official Stock Tokens and Chainlink
feeds exist only on Robinhood Chain mainnet, which stays out of this registry; see
[Robinhood Chain market data](#robinhood-chain-market-data).

The faucet endpoint returns manual instructions; it does not send funds. Balance
queries use Web3 through the registry RPC, not the CDP token-balance endpoint.

## Adapters

| Adapter | Operations | Network I/O |
| --- | --- | --- |
| `EvmExplorerAdapter` | `explorer_url` | None |
| `EvmRpcAdapter` | `get_balance`, `verify_transaction` | Read-only JSON-RPC through an injected `Web3` |

`EvmRpcAdapter` checks the chain's capabilities and validates every address and
hash before any RPC call. Before its first query it compares `eth_chainId` with the
registry entry and raises `ChainMismatchError` on a mismatch, so a mistyped
override cannot read another network.

- `get_balance(address)` returns the native and stablecoin balances, scaled by the
  registry's decimals.
- `verify_transaction(tx_hash, expected_transfer=None, min_confirmations=1)`
  returns `not_found`, `pending` (in the mempool, or mined with too few
  confirmations), `failed` (reverted) or `confirmed`, with the block and
  confirmation count. With an `expected_transfer`, it also reports whether the
  receipt has a Transfer log from the registry's stablecoin with that exact sender,
  recipient and amount. `verified` is true only for a confirmed transaction whose
  expected transfer, if any, matched.

Transfers and Aave calls stay in `AgentKitService`: they are signed by the CDP
wallet provider, which uses its own RPC client. No adapter holds keys.

Explorer templates deliberately support only HTTPS URLs of the form
`https://HOST/tx/{tx_hash}`, `/address/{address}`, and `/block/{block_number}`.
Credentials, query strings, fragments, and extra formatting fields are forbidden.
Custom explorer URL shapes require a deliberate schema/adapter change.

Loader errors report validation reasons without raw values, field locations,
file paths, or parser details. Keep validator messages free of user input; unknown
field names can also contain secrets. Do not log raw TOML or direct Pydantic errors.

## Robinhood Chain market data

`chains/market_data.toml` is a reviewed allowlist of tokenized stocks on Robinhood
Chain mainnet (`eip155:4663`) whose Chainlink price history may be read for analysis.
The maintainers approved this read-only mainnet exception in #18. It is separate from
the registry and has no capabilities: `TokenPriceHistoryReader` sends only `eth_call`
through Multicall3, never wallets, signing or transactions. The RPC is resolved like
registry entries, through `QB2_ROBINHOOD_MAINNET_RPC_URL` or the public endpoint.

Each entry joins Robinhood's asset list with Chainlink's Robinhood feed directory and
was checked on-chain at `reviewed_block`: the token's `symbol()`, 18 decimals and
`uiMultiplier()`, and the feed's `description()` and 8 decimals. Feeds report the
**token** price, which already includes the multiplier; it is never applied again.
Before reading, the reader compares each feed's description, decimals and phase with
the allowlist and fails if they changed or the feed has been silent for over 7 days
(weekends plus a market holiday reach about 104 hours). A Chainlink phase upgrade
therefore blocks reads until the allowlist is reviewed, even for older windows.

History rules (`chains/price_history.py`):

- Rounds before `first_valid_round` are excluded. Each feed's launch rounds
  (2026-06-22 to 2026-06-23 13:50 UTC) were published at about 1e8x the price.
- Every round in the window must have a positive answer, ordered timestamps,
  `answeredInRound >= roundId`, and move under 50% from the previous round; any
  violation rejects the request. Missing data is never zero-filled or substituted.
- Each weekday's price is the last valid round at or before 21:00 UTC (after the
  16:00 ET close in summer and winter time), if it is at most 36 hours old. Feeds
  publish on a 0.5% move or a 24-hour heartbeat, so a quiet day keeps the last
  published price; that is the feed's value at the cutoff, not a substitute.
- A weekday on which no selected feed published (a market holiday such as
  2026-07-03 or Labor Day) is dropped rather than adding a zero return. Dates where any
  selected asset lacks a price are dropped too; fewer than 60 remaining dates is an
  error. The range is limited to 366 days, must contain at least 60 weekdays, and must
  not end in the future. A cutoff after the read block is not yet a close.
- `PriceHistory` records the chain, block number/hash, token and feed addresses,
  decimals, and the round ID and `updatedAt` of every close. `to_wide_csv()` produces
  the optimizer's existing wide price format.

Chainlink rounds are immutable, so the recorded round IDs reproduce a series later.
The public RPC is not an archive node and does not serve old block state.

To add an asset, confirm it in `GET https://api.robinhood.com/rhj/assets` and
[Chainlink's Robinhood feeds](https://docs.chain.link/data-feeds/price-feeds/addresses?network=robinhood),
verify the on-chain fields above, read its rounds to find the first valid one, and
update `reviewed_block`.

## Public API

`GET /api/v1/chains` is public and requires no wallet credentials, RPC, or database query.

The response has `default_chain_id` and an ordered `chains` list. Each enabled
entry contains exactly:

- `chain_id`, `family`, `display_name`, `testnet`
- `aliases`: legacy network names, such as the `network` stored on wallets
- `native_token`: `symbol`, `decimals`
- `stablecoin`: `symbol`, `decimals`, `address`, or `null`
- `explorers`: `transaction`, `address`, `block` templates
- `capabilities`: the operations declared above for each network

RPC configuration, provider aliases, and escrow configuration are excluded from
responses and OpenAPI.

## Starknet session policies

Ready (Argent) is the owner wallet. In this version the owner signs `register_session`, `spend`, and `revoke_session` on `backend/contracts/starknet`. The backend stores only the session private key, encrypted with `WALLET_ENCRYPTION_KEY`. That key is not registered on the Ready account and `spend` does not check it. `spend` reverts on-chain when the amount exceeds `max_per_proposal` (`per_call`), the UTC day total exceeds `daily_budget` (`daily`), the session is past `expires_at` (`expired`), or it has been revoked (`revoked`).

AVNU's Sepolia paymaster (`https://sepolia.paymaster.avnu.fi`, header `x-paymaster-api-key` from `AVNU_PAYMASTER_API_KEY`) may sponsor `deploy_account` and `register_session` only. Spends and revokes are not sponsored.

Contributor toolchain, not imported by the running API until a session is created: [Scarb](https://docs.swmansion.com/scarb/) to build the contract (`scarb build` in `backend/contracts/starknet`, Cairo 2.8) and [`starknet.py`](https://pypi.org/project/starknet.py/) (`uv add starknet.py` from `backend`) to generate the session key. Scarb is a separate install of a few hundred megabytes. `starknet.py` is an extra Python dependency used only for the Stark curve keypair. Policy decisions and the paymaster gate are covered by `tests/unit/test_starknet_policy.py` without either tool and without a funded account.

## Adding another EVM testnet

1. Verify its ID, token metadata, and explorer against official sources. Check
   locked provider versions for each operation before adding provider mappings.
2. Copy a `[[chains]]` entry and replace network-specific fields. Use a unique
   `eip155:NUMBER` without leading zeros and unique aliases. Unknown provider
   mappings and stablecoin metadata can be omitted.
3. Set `testnet = true`, choose `enabled`, and declare only implemented capabilities.
4. Set `rpc_env_var`, add a keyless `public_rpc_url` if one exists, and document
   the variable in `.env.example`.
5. Add metadata expectations and run the focused tests below.

## Verified sources and provider limits

Checked October 21, 2026:

- [CAIP-2](https://standards.chainagnostic.org/CAIPs/caip-2) defines the namespaced
  identifier. This slice intentionally accepts only canonical decimal EVM IDs.
- [Base network details](https://docs.base.org/get-started/connect-to-base)
  specify Base Sepolia ID `84532`, ETH, and its explorer.
- [Ethereum client Sepolia metadata](https://github.com/eth-clients/sepolia)
  specifies ID `11155111` and its explorers.
- [Robinhood Chain's connection page](https://docs.robinhood.com/chain/connecting/)
  specifies testnet ID `46630`, ETH, its public RPC and explorer (checked October 28,
  2026; `eth_chainId` returned `0xb626`). Robinhood's asset API lists every Stock
  Token on mainnet `4663` only.
- [Ethereum's ether reference](https://ethereum.org/developers/docs/intro-to-ether/)
  defines 18 decimal places. Both entries use ETH as the native token.
- [Circle's contract list](https://developers.circle.com/stablecoins/usdc-contract-addresses)
  supplies both test USDC addresses. [Circle's USDC reference](https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-usdc/SKILL.md)
  documents the six-decimal ERC-20 representation. These are test tokens.
- The [AgentKit 0.7.4 distribution](https://pypi.org/project/coinbase-agentkit/0.7.4/)
  was inspected using the wheel URL and SHA-256 from `uv.lock`:
  `coinbase_agentkit/network/network.py` maps both IDs; the wallet provider's
  `_get_cdp_sdk_network` maps both aliases.
- The [CDP SDK 1.45.1 distribution](https://pypi.org/project/cdp-sdk/1.45.1/)
  was inspected the same way. Its `ListEvmTokenBalancesNetwork` enum includes
  `base`, `base-sepolia`, and `ethereum`, **not `ethereum-sepolia`**.
  [Coinbase's balance documentation](https://docs.cdp.coinbase.com/server-wallets/v2/using-the-wallet-api/managing-accounts)
  lists the same subset. Thus Ethereum Sepolia is suitable for this metadata/link
  layer, but general wallet support cannot be inferred from its alias. This
  restriction concerns CDP token-balance queries; the existing service reads
  balances directly through Web3.

## Validation

From `backend`, with project dependencies installed:

```bash
uv run --no-sync pytest tests/unit/test_chain_registry.py tests/unit/test_chain_adapter.py tests/unit/test_chains_api.py -q
uv run --no-sync pytest tests/unit/test_chain_rpc.py tests/unit/test_chain_rpc_adapter.py -q
uv run --no-sync pytest tests/unit/test_chains_bootstrap.py tests/unit/test_wallet_registry_service.py tests/unit/test_basescan_registry.py -q
uv run --no-sync ruff check src/quantum_backend_v2/chains src/quantum_backend_v2/api/routers/chains.py tests/unit/test_chain*.py
uv run --no-sync mypy --follow-imports=silent src/quantum_backend_v2/chains src/quantum_backend_v2/api/routers/chains.py
uv run --no-sync pytest tests/unit/test_market_data.py tests/unit/test_token_price_history.py -q
# Optional read-only mainnet check (eth_call only):
QB2_ROBINHOOD_LIVE_TEST=1 uv run --no-sync pytest tests/live/test_robinhood_price_history.py -m live_robinhood -q
```

`test_token_price_history.py` replays real rounds recorded from Robinhood Chain
mainnet (`tests/fixtures/robinhood_chainlink_rounds.json`, SPY and QQQ at the block
it names) through an in-process JSON-RPC provider; the live check compares the same
rounds with the chain.

The first command runs isolated registry/API tests. Bootstrap tests exercise the
real app factory and lifespan with persistence, recovery, peers, and legacy external
service clients mocked;
they require the backend's other import-time dependencies. None of these use a
database, blockchain, or wallet: the RPC adapter tests answer JSON-RPC from a
scripted in-process provider. They do not verify live peer or wallet integration.

The dependency fix pins the published libp2p 0.6.0 release and removes the moving
archive URL; see [Local development](README.md#local-development). The bootstrap
unit tests still mock peer services. The existing `test_libp2p_peerstore.py` tests
exercise the real library with temporary SQLite files.
`tests/network/test_libp2p_transport.py` verifies real bidirectional RPC, discovery
delivery, and shutdown between two local peers without external services.

## Existing escrow configuration

The Base Sepolia Aave pool `0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b` was
moved from the service to the registry without changing it. Its capability flags
preserve existing transaction-building paths; they do not verify deployment or
reserve compatibility. The [current Aave address book](https://github.com/bgd-labs/aave-address-book/blob/main/src/AaveV3BaseSepolia.sol)
lists a different pool and a different test USDC reserve from this application's
Circle test USDC. Do not substitute one of those addresses alone: pool/token
compatibility and existing positions need a separate escrow review. No live
Aave transaction or contract verification was performed for this migration.

## Frontend

`src/features/chains` in the frontend reads `/api/v1/chains` through `/api/chains`.
Wallet, funding and storage-export screens resolve the wallet's stored `network`
through `aliases` and build explorer links from the registry templates; none of
them hard-code an explorer or network. The wallet transfer tab and the proposal
funding dialog show a chain selector. Only the wallet's own network is selectable,
and only when it has the operation's capability (`transfer_stablecoin`,
`aave_supply`), because wallet and funding requests do not take a network yet.

## Out of scope for #2

Enabling a second wallet network, letting requests choose a network, and
network-aware wallet/payment persistence wait until a second chain supports
wallets. Confirming payouts with `verify_transaction` belongs to the payout work
in #8. Existing payment recording and confirmation semantics remain unchanged.
