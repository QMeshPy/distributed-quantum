# Algorand x402 Design

**Date:** 2026-08-28
**Target:** Algorand TestNet USDC, with a configuration-only MainNet switch

## Goal

Expose quantum circuit submission as an x402-paid API without weakening the
existing user API or storing customer wallet keys.

## Existing state

- The application has no active x402 route. `coinbase-agentkit` only brings in
  the unrelated EVM-oriented Python `x402` package transitively.
- Quantum circuit submission is an authenticated FastAPI job workflow.
- The public Next.js deployment already proxies browser requests to FastAPI.

## Selected architecture

```text
x402 client
  -> POST /api/x402/quantum/runs (Next.js, public)
  -> POST /api/x402/options/runs (Next.js, public)
  -> @x402/next verifies Algorand payment with the hosted facilitator
  -> internal FastAPI submission route (shared secret)
  -> existing CircuitJobService / OptionsJobService

x402 client
  -> GET /api/x402/quantum/runs/{unguessable job id} (free polling)
  -> GET /api/x402/options/runs/{unguessable job id} (free polling)
  -> internal FastAPI job route (shared secret)
```

Both paid routes share one Next.js resource server (`frontend/src/features/x402/server/runtime.ts`)
registered against a single Algorand receiver and dispatch to their own
internal FastAPI route by request path. The pharma pipeline is intentionally
not wired to x402 yet — its job store is in-memory only and unauthenticated,
so a paid mainnet request could vanish on a backend restart with no owner
record. That needs its own persistence fix before it takes payment.

The paid routes use the official `@x402/avm` exact scheme, TestNet USDC, and
explicit route metadata (including the `x402-global-challenge` Bazaar tag) so
Bazaar discovery records the real routes instead of a wildcard. Payment
settles only after a successful backend response.

The seller config contains only a public Algorand receiver address. Payer keys
stay with the calling client. The receiver must hold enough ALGO for Algorand's
minimum balance and opt in to the USDC ASA before receiving payments.

## Security and failure behavior

- The internal FastAPI routes exist only when `QB2_X402_GATEWAY_SECRET` is set.
- Next.js sends that secret server-to-server; it is never exposed as a public
  environment variable.
- The public paid endpoint stays disabled until all required settings validate.
- Invalid payments never reach FastAPI. Backend 4xx/5xx responses are returned
  without settlement.
- Job identifiers are high-entropy capability URLs for free polling. Add a
  signed access token only if job identifiers must be shared in lower-trust
  channels.
- No mnemonic, private key, facilitator signing key, or user wallet is stored by
  the platform.

## Configuration

Frontend/Vercel:

- `X402_ENABLED=true`
- `X402_NETWORK=testnet` (or `mainnet` after rollout approval)
- `X402_AVM_ADDRESS=<58-character receiver address>`
- `X402_FACILITATOR_URL=https://facilitator.goplausible.xyz`
- `X402_QUANTUM_RUN_PRICE=$0.01`
- `X402_GATEWAY_SECRET=<shared random secret>`
- existing `NEXT_PUBLIC_BACKEND_URL`

Backend:

- `QB2_X402_GATEWAY_SECRET=<same shared random secret>`

## Wallet and rollout formalities

TestNet needs a receiver Algorand account, ALGO funding, TestNet USDC asset
opt-in (`10458941`), and optional test USDC. A payer account additionally needs
TestNet USDC to exercise settlement. MainNet uses USDC ASA `31566704` and must
not be enabled until the receiver and operational custody process are approved.

MetaMask is not part of this design because AVM payments use Algorand accounts.
Pera, Defly, Lute, or an SDK signer can be used by payers; the resource server
requires no wallet extension and no external API key for the hosted facilitator.

## Explicit non-goals

- Removing Coinbase AgentKit wallet functionality.
- Creating custodial Algorand wallets for platform users.
- Self-hosting the facilitator.
- Charging every job-status poll.
