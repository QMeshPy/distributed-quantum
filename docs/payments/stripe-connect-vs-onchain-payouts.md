# Spike: Stripe Connect stablecoin payouts vs on-chain worker payouts

**Issue:** [#77](https://github.com/QMeshPy/distributed-quantum/issues/77)  
**Date:** 2026-10-29  
**Depends on:** [#8](https://github.com/QMeshPy/distributed-quantum/issues/8) (pay-per-fragment on-chain), [#10](https://github.com/QMeshPy/distributed-quantum/issues/10) (Stripe Billing + optional Connect phase; closed for subscriptions/credits)  
**Epic:** [#1](https://github.com/QMeshPy/distributed-quantum/issues/1)

## Goal

Compare paying worker earnings through **Stripe Connect stablecoin payouts** against **our own on-chain USDC payouts**, then recommend one of:

1. Connect only  
2. On-chain only  
3. Worker’s choice (hybrid)

## Sources

- Stripe: [Stablecoin payouts for Connect](https://docs.stripe.com/connect/stablecoin-payouts) (private preview; US platforms)  
- Stripe: [Connect pricing](https://stripe.com/connect/pricing) (standard bank/debit payout fees; stablecoin-specific fee not published in preview docs)  
- Repo today: `marketplace_service.distribute_payment_to_workers` → AgentKit USDC transfers; Better Auth Stripe Billing for subscriptions/credits (`frontend/src/features/billing`) — **no Connect worker payouts yet**

---

## Option A — Stripe Connect stablecoin payouts

| Dimension | Findings |
|---|---|
| **Onboarding / KYC** | Platform must be a Connect platform; workers become connected accounts and complete Stripe KYC. Individuals use the **Express Dashboard** to link a crypto wallet and set preferred currency to USDC. |
| **Countries** | **Platform must be US-based** (private preview). Recipients: individuals / sole proprietors in a fixed country list (includes many EU/APAC/LATAM markets; **NY and HI excluded** for US individuals). Companies and non-profits **not** supported yet. |
| **Fees** | Preview docs do not publish a dedicated stablecoin payout fee. Connect bank/debit payouts are typically **0.25% + 25¢** when you handle pricing; Instant Payouts **1%**. Expect conversion / crypto rails fees in addition once GA — **confirm with Stripe sales before budgeting**. |
| **Supported networks / assets** | Starts with **USDC**; platform balance stays **fiat**; Stripe converts and pays out to the linked wallet. Network set is Stripe-controlled (not our chain registry). |
| **Custody** | Funds move through Stripe balances, then to the worker’s linked wallet. Platform does not hold worker private keys; Stripe / Connect owns KYC and payout ops. |
| **Failure modes** | Preview access denied or delayed; KYC reject; unsupported country/entity type; Express Dashboard required; Transfers API mis-use; conversion or wallet-link failures; payout holds from risk review. Dust / high-frequency fragment payouts are a poor fit for Transfer + KYC latency. |
| **Fit with #10** | Matches the “optional Connect phase” (bank or crypto off-ramp). Subscriptions/credits already use Stripe; Connect would reuse the same vendor for **worker cash-out**. |

**Pros:** KYC/compliance and off-ramp handled by Stripe; workers can end in a wallet without us building banking; Express UI reduces custom dashboards.  
**Cons:** US-platform-only preview; no company workers; not aligned with multi-chain registry (#2); opaque/preview fees; heavy for pay-per-fragment (#8); vendor lock-in.

---

## Option B — On-chain payouts (registry EVM + AgentKit)

| Dimension | Findings |
|---|---|
| **Onboarding / KYC** | Worker registers a **wallet address** in pricing registry. No Stripe KYC. Platform / ops can still require optional identity elsewhere (#23 SIWE, etc.). |
| **Countries** | No Stripe country matrix. Limited by chain availability, sanctions policy, and wallet access — not by Connect’s recipient list. |
| **Fees** | **Gas** (+ any facilitator / x402 fees if payment is routed that way). No Connect monthly active-user or payout percentage. Dust batches (#8) keep gas amortized. |
| **Supported networks** | Whatever the **chain registry** enables (Base Sepolia today; Arbitrum #15, etc.). USDC (or test USDC) via existing AgentKit path in `distribute_payment_to_workers`. |
| **Custody** | Worker-controlled wallets. Platform signs transfers from job/user/platform wallets per existing marketplace design. |
| **Failure modes** | RPC / gas / insufficient balance; wrong network; failed fragment (should not pay — #8); double-pay without idempotency; wallet typo. Content-layer / Helia failures must not block quantum execution (roadmap ground rule). |
| **Fit with #8** | Designed for **idempotent per-fragment** payout intents, batching, reputation, and escrow budgets — all natural on-chain + payment-event ledger (#3). |

**Pros:** Matches marketplace + multi-chain roadmap; already partially implemented; low friction for crypto-native workers; suits incremental fragment pay.  
**Cons:** No built-in bank off-ramp or KYC; workers who only want fiat still need a bridge (CEX, third-party, or later Connect).

---

## Head-to-head

| | Connect stablecoin | On-chain (AgentKit / registry) |
|---|---|---|
| Onboarding | Stripe KYC + Express + wallet link | Wallet address in registry |
| Geography | US platform; limited recipient types/countries | Registry / policy limited |
| Fees | Connect + conversion (TBD in preview) | Gas (+ optional batching) |
| Networks | Stripe’s USDC rails | Our registry chains |
| Custody | Stripe balances → linked wallet | Direct wallet transfer |
| Pay-per-fragment (#8) | Awkward (Transfer latency, KYC) | Natural with payment events |
| Bank off-ramp | Strong (Connect bank payouts from #10) | Weak without a third party |
| Preview / readiness | Private preview | Code path exists today |

---

## Recommendation: **worker’s choice (hybrid)** — on-chain default, Connect optional off-ramp

**Do not** choose Connect-only: preview + US-platform lock-out + no company workers + mismatch with multi-chain registry and #8.

**Do not** choose on-chain-only forever: #10 already planned Connect for workers who want a normal cash-out; some contributors will not want to touch wallets.

**Preferred posture:**

1. **Default marketplace settlement = on-chain USDC** on registry chains (finish #8: pay-per-fragment, idempotent payment events, escrow caps).  
2. **Optional Connect off-ramp** for workers who opt in: bank payout and/or Connect stablecoin payout **after** earnings are recorded in our ledger — not as the primary per-fragment rail.  
3. Gate Connect stablecoin on: preview access approved, fee sheet from Stripe, and non-US platform strategy documented (or accepted as US-only).  
4. Keep all chain ids / USDC addresses behind the **chain registry** (#2); never hardcode Stripe’s network as a substitute for registry networks.

This is “worker’s choice” at cash-out time, not “two competing settlement systems per fragment.”

---

## Follow-up implementation issues (opened)

| Priority | Issue | Scope |
|---|---|---|
| P0 | [#8](https://github.com/QMeshPy/distributed-quantum/issues/8) | Finish pay-per-fragment on-chain payouts (default rail) |
| P1 | [#110](https://github.com/QMeshPy/distributed-quantum/issues/110) | Optional Stripe Connect Express onboarding for workers |
| P2 | [#111](https://github.com/QMeshPy/distributed-quantum/issues/111) | Connect off-ramp from ledger (bank and/or stablecoin) |
| P1 | [#112](https://github.com/QMeshPy/distributed-quantum/issues/112) | Document worker payout modes runbook |

**Not opened:** Connect-only migration; replacing AgentKit transfers with Stripe Transfers for every fragment.

---

## Ground rules check

- Testnet-first for on-chain; Stripe **test mode** for Connect experiments.  
- No secrets in the repo (Stripe keys via env only).  
- Chain logic stays behind the registry.  
- Tests and docs ship with implementation PRs; this spike is docs-only.
