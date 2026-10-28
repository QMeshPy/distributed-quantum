# Payment events and credit ledger — Part of #3

Every payment rail (x402, cards, Zcash, swaps, on-chain transfers) records the
same kind of payment event, and value that enters the platform's internal credit
system is written to one append-only, USDC-denominated ledger. The aim is
"accept anywhere and settle once": idempotency, reconciliation and
double-payment protection exist once instead of once per rail.

Code: `src/quantum_backend_v2/payments/` (`models.py`, `ledger.py`, `errors.py`).

## Collections

| Collection | Contents | Unique on |
| --- | --- | --- |
| `payment_events` | One document per payment, with its status history | `idempotency_key` |
| `credit_ledger` | Append-only entries: `credit`, `hold`, `capture`, `release` | `idempotency_key` |
| `credit_holds` | Guard: amount still capturable or releasable per hold | `hold_id` |
| `credit_balances` | Guard: cached `available` and `held` per account | `account_id` |

`payment_events` also indexes `job_id`, `proposal_id`, `status` and
`(status, created_at)`. Money is stored as `Decimal128`, never as floats.
Indexes are created at app startup and before a `LedgerService` first writes.

## Payment events

`record_event` stores an event once per idempotency key. Replaying a key returns
the stored event with `created=False`. Replaying it with a different rail,
purpose, asset, amount or ledger account raises `IdempotencyConflictError`.

```
pending ──> confirmed ──> refunded
   │  └──> failed
   └──> uncertain ──> confirmed | failed   (admin reconciliation only)
```

- `confirm` (pending → confirmed) credits the event's `ledger_account_id`, if it
  has one. Calling it again is harmless and finishes a credit a crash interrupted.
- `mark_uncertain` is for payments whose outcome is unknown, such as a timeout after a
  transaction may have been broadcast. Replaying an uncertain key raises
  `PaymentUncertainError`, and `confirm` refuses it: **uncertain payments are
  never retried automatically.**
- `reconcile` lets an admin resolve a pending or uncertain event as confirmed or
  failed after checking the rail. The admin's id and reason go into the status history.
- `refunded` is reserved. Refund policy is out of scope for #3.

### Choosing idempotency keys

Use a key that names the payment itself, so a retry produces the same key:

| Payment | Key |
| --- | --- |
| Stripe credit pack (#10) | `stripe:checkout:<checkout session id>` |
| Fragment payout (proposals) | `fragment_payout:<proposal id>:<fragment id>:<attempt>` |
| Worker payout batch (#8) | `worker_payout:<batch id>` |
| Full escrow release | `escrow_release:<proposal id>:<attempt>` |
| Proposal funding | `proposal_funding:<proposal id>:<deposit tx hash>` |
| USDC transfer | `metadata["idempotency_key"]`, else `transfer:<uuid>` |

Use the Stripe session id rather than the event id: an asynchronously paid
session produces two events with different ids for the same payment.

## Credit ledger

Ledger entries are never updated or deleted. An account's balance is defined by
`derive_balance`: credits add to `available`; a hold moves value from
`available` to `held`; a capture spends held value; a release returns it.
`LedgerService.balance` always sums the entries; it never reads the guards.

```python
await ledger.hold(account, Decimal("12"), hold_id=job_id, job_id=job_id)  # on submit
await ledger.capture(job_id, actual_cost, idempotency_key=f"capture:{job_id}")
await ledger.release(job_id, idempotency_key=f"release:{job_id}")  # the rest
```

### Concurrency without transactions

Our MongoDB runs as a standalone server, which has no multi-document
transactions. Instead, each hold, capture or release changes its guard
document with one atomic conditional update:

- a hold succeeds only if `credit_balances.available >= amount`;
- a capture or release succeeds only if `credit_holds.remaining >= amount`;
- a full release compares and sets the remainder it read.

The ledger entry's unique key decides between concurrent replays of the same
operation; the loser undoes its guard change and returns the winner's entry.

Writes are ordered so a crash between two steps always **fails closed**: value
can end up reserved and unusable until reconciled, but never spendable twice.
Credits write the ledger before the guard; holds, captures and releases change
the guard first. A hold guard lost between two inserts is rebuilt from the
ledger on the next capture or release.

## Reconciliation

`run_reconciliation` runs every `QB2_PAYMENT_RECONCILE_INTERVAL_SECONDS`
(default 300; `0` disables) and on demand. It:

1. marks pending events older than 30 minutes that have **no external
   reference** as uncertain. Their outcome was never recorded. Events
   with a tx hash or Stripe id are awaiting their rail and are left alone;
2. compares each account's `credit_balances` guard with its ledger sum and
   reports drift. It does not repair drift, so an operator can find the cause first.

## Admin API

All routes require the admin role. None of them can write ledger entries.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/admin/payments/events?status=uncertain` | List events (also `job_id`, `proposal_id`, `limit`) |
| GET | `/api/v1/admin/payments/events/{key}` | One event with its status history |
| POST | `/api/v1/admin/payments/events/{key}/reconcile` | `{"outcome": "confirmed" \| "failed", "reason": "...", "external_ref": "0x..."}` |
| POST | `/api/v1/admin/payments/reconciliation` | Run the sweep now |
| GET | `/api/v1/admin/payments/accounts/{account_id}/balance` | Balance derived from the ledger |

## First consumers

The existing Base Sepolia paths write events without changing their responses:

- `AgentKitService.transfer_usdc` records a pending event before sending and
  confirms it with the tx hash.
- `ProposalService.fund_proposal` records a confirmed event for the escrow deposit.
- `_pay_fragment_researcher` and `_release_all_escrow` record a pending event per
  attempt before withdrawing. A new attempt is allowed only after every earlier
  one failed, so resubmitting results no longer pays a researcher twice.

A send that fails with `ValueError` (validation, before anything is sent) marks the
event failed. Any other error marks it uncertain. If updating an event fails
after funds moved, the error is logged and the sweep flags the event later.

On-chain events are confirmed when the transaction is broadcast, as the legacy
`payments` records are. Receipt-based confirmation is a follow-up.

## Integrating a new rail

1. `record_event(...)` with a key that names the payment, before value moves.
   Set `ledger_account_id` if the payment should become credit.
2. Move the value only if `created` is true.
3. `confirm(key, external_ref=...)` when it settles, `fail` when it definitely
   did not, and `mark_uncertain` when you cannot tell.

## Prepaid credits (#10)

Users can buy credit packs by card and spend the credits on circuit runs. One
credit is one USDC, so card-bought credits sit in the same ledger as everything else.

```
Settings → POST /api/billing/credits/checkout → Stripe Checkout (mode: payment)
Stripe → /api/auth/stripe/webhook  (signature check, event-id de-dupe)
       → line items → credits      (from STRIPE_CREDIT_PACKS, never the client)
       → POST /api/v1/internal/billing/credit-purchases  (X-Billing-Internal-Secret)
       → payment event stripe:checkout:<session id> → ledger credit
```

**Buying.** Packs are Stripe one-time Prices mapped to credit amounts in
`STRIPE_CREDIT_PACKS` (frontend). The webhook handles credit-pack sessions itself
and does not forward them to the subscription plugin. It works out the credits from
the session's line items as Stripe recorded them. A session paid by a delayed
method completes unpaid and is credited on
`checkout.session.async_payment_succeeded`.

**Exactly once.** The frontend de-duplicates Stripe events by id. The backend
keys the purchase on the Checkout Session (`stripe:checkout:<session id>`), so a
redelivered event, or the two events of one async session, credit once. A
redelivery also finishes a credit that a crash interrupted.

**Spending.** With `QB2_CIRCUIT_JOB_CREDIT_COST` above 0, submitting a circuit holds
its cost under `job:<job id>`, or returns `402 insufficient_credits`. A completed job
captures the hold. A failed one releases it, less what its workers earned for
finished fragments (#8). If the server stops mid-job, the
hold stays reserved and is never spent twice. Releasing holds for jobs that never
finish is a follow-up; there is no admin route for it yet. The default of 0
keeps runs free. x402 runs are paid per request and never use credits.

**Identity.** Runs and balances use the signed `qn1` assertion, so both sides need
the same `AGENT_AUTH_BRIDGE_SECRET`. Without it, runs are submitted anonymously as
before and are not charged to a user.

### Configuration

| Side | Variable | Purpose |
| --- | --- | --- |
| Frontend | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | Stripe billing (#42); required for packs too |
| Frontend | `STRIPE_CREDIT_PACKS` | `price_abc:10,price_def:50` |
| Both | `BILLING_INTERNAL_SECRET` / `QB2_BILLING_INTERNAL_SECRET` | Same 32+ character secret; guards the purchase route |
| Both | `AGENT_AUTH_BRIDGE_SECRET` | Signs the user's identity for runs and balances |
| Backend | `QB2_CIRCUIT_JOB_CREDIT_COST` | Credits per circuit run; `0` disables charging |
| Frontend | `STRIPE_STABLECOIN_PAYMENTS` | `true` also offers USD packs in USDC (#76); off by default |

### Manual test (Stripe CLI, test mode)

1. In the Stripe Dashboard (test mode), create a product with a **one-time** price,
   e.g. $10, and set `STRIPE_CREDIT_PACKS=price_...:10`.
2. Set the secrets above, `QB2_CIRCUIT_JOB_CREDIT_COST=2`, and restart both apps.
3. `stripe listen --forward-to localhost:3000/api/auth/stripe/webhook`
4. Settings → Credits → **Buy 10 credits · $10.00**, pay with `4242 4242 4242 4242`.
   The balance shows 10.
5. `stripe events resend <evt_id>`: the webhook returns `duplicate: true` and the
   balance stays 10. `GET /api/v1/admin/payments/events/stripe:checkout:<cs_...>`
   shows one confirmed card event.
6. Submit a circuit run: the balance drops to 8, with 2 reserved while it runs and
   spent once it completes. With fewer than 2 credits, submitting shows the 402 message.

### Stablecoin credit packs (#76)

With `STRIPE_STABLECOIN_PAYMENTS=true`, each USD-priced pack can also be bought
in stablecoins through Stripe's `crypto` payment method. The customer pays from
their own wallet on crypto.stripe.com and Stripe settles to our balance in USD. We
hold no wallet keys, run no on-chain code and store no payment details.

```
Settings → "… in USDC" → POST /api/billing/credits/checkout {priceId, method: "crypto"}
       → Checkout Session with payment_method_types: ["crypto"]
Stripe → webhook → session retrieved with payment_intent.payment_method expanded
       → POST …/credit-purchases {…, payment_method: "crypto"}
       → payment event stripe:checkout:<session id>, rail "stablecoin"
```

- **Hidden when off.** Once stablecoins are enabled in the Stripe Dashboard,
  Stripe shows them on every Checkout. Card sessions therefore always pass
  `excluded_payment_method_types: ["crypto"]`, and a stablecoin session is only
  created when the flag is on and the pack's Price is in USD.
- **Exactly once.** Nothing new: the purchase is still keyed on the Checkout
  Session, so a redelivered event, or `completed` followed by
  `async_payment_succeeded`, credits once. The rail is part of the event's
  identity, so one session can never be recorded as both card and stablecoin.
- **Rail.** Only Stripe's `crypto` method is recorded on the `stablecoin` rail.
  Cards and Stripe's other dynamic methods stay on `card`.

**Not supported (per Stripe's docs):**

- **Disputes.** Stablecoin payments cannot be disputed, so there are no chargebacks
  to claw credits back.
- **Manual capture.** Stablecoin payments cannot be authorized and captured later.
  Credit packs never relied on that: credits are granted once the session is paid,
  and job holds are taken from the internal ledger, not from Stripe.
- **Refunds** are supported, full or partial, and go back as stablecoins to the
  paying wallet. Refunding does not yet debit the credits it granted; that applies
  to card refunds too and is a follow-up.
- **Limits.** Stablecoin Checkout needs USD prices, US$10,000 at most per
  transaction, and a Stripe account approved for "Stablecoins and Cryptocurrency".
  Stripe currently offers it to US businesses (not New York); other regions are in
  private preview. Stablecoin subscriptions are out of scope.

**Manual test (sandbox).**

1. Dashboard → Settings → Payment methods: request **Stablecoins and Cryptocurrency**
   and wait until it is active.
2. Use a USD one-time price in `STRIPE_CREDIT_PACKS`, set
   `STRIPE_STABLECOIN_PAYMENTS=true` and restart the frontend.
3. Fund a MetaMask wallet on Polygon Amoy with test USDC (faucet.circle.com) and a
   little POL for gas (faucet.polygon.technology).
4. `stripe listen --forward-to localhost:3000/api/auth/stripe/webhook`, then
   Settings → Credits → **Buy 10 credits · $10.00 in USDC** and pay on
   crypto.stripe.com. The balance shows 10.
5. `stripe events resend <evt_id>`: `duplicate: true`, the balance stays 10, and
   `GET /api/v1/admin/payments/events/stripe:checkout:<cs_...>` shows one confirmed
   `stablecoin` event.
6. With the flag off, the USDC buttons disappear and card Checkout no longer
   lists crypto.

## Pay-per-fragment worker payouts (#8)

Workers who run a circuit job's fragments are paid per fragment as results are
recorded, from the job's credit hold, in batched USDC transfers.

```
fragment result recorded (CircuitJobService.process)
  -> payout intent fragment:<job id>:<fragment id>   (one per fragment, ever)
       priced from worker_pricing, reserved against the job's credit hold
  -> settler: a worker's accrued intents reach the threshold or max age
  -> one USDC transfer from the payout wallet  (payment event worker_payout:<batch id>)
  -> verify_transaction on the receipt -> intents paid, total_earned += amount
```

**Who is paid.** A fragment result names the libp2p peer that ran it. The peer's
enrollment owner (`peer_enrollments.owner_user_id`) is the worker, and their
`worker_pricing` entry supplies the price and payout wallet. Enrollment is unique
per peer, so registering pricing cannot redirect another worker's payouts.

**Price.** One fragment is one operation. Its price is the worker's registered
price for that operation type (`hadamard`, `cnot`, …), or their `custom` price.

**Exactly once.** The intent's unique key is `(job, fragment)`. Re-processing a
job, or recording the same fragment concurrently, stores one intent, reserves the
budget once and changes reputation once.

**Budget.** The first intent for a job copies the job's credit hold into a
`payout_budgets` guard. Each intent is reserved with one atomic conditional
update, so concurrent fragments can never commit more than the hold. Jobs without
a hold (credit metering off, x402 runs) record intents as `no_budget` and pay
nothing. When a job fails, the credit meter captures what its workers earned and
releases only the rest, so the user pays for finished work and nothing else.

**Withheld fragments** are recorded with an amount of 0 and a reason, and are
never paid:

| Reason | When | Reputation |
| --- | --- | --- |
| `fragment_failed` | The fragment's result is not a success | −5 |
| `fidelity_rejected` | Observed fidelity below `QB2_WORKER_PAYOUT_MIN_FIDELITY` | −5 |
| `job_failed` | The job failed before this fragment ran | — |
| `unknown_worker` | The peer is not enrolled, or its owner has no pricing or wallet | — |
| `unpriced` | No positive price for the operation | — |
| `no_budget` / `over_budget` | The job has no credit hold, or it is used up | +2 |

Paid fragments add +2. Reputation is clamped to 0–100, and a worker below 20 is
deactivated, as in `MarketplaceService.update_worker_reputation`.

**Settlement.** Intents move `accrued → settling → submitted → paid`. The settler
only runs when `QB2_WORKER_PAYOUT_WALLET` names a platform-managed wallet in the
`wallets` collection; otherwise intents accrue and nothing is sent.

- A send that fails validation (`ValueError`, nothing broadcast) returns the
  batch's intents to `accrued` for the next run.
- Any other send error leaves the batch `uncertain` and its intents `settling`.
  They are **never sent again automatically**; resolve the batch's
  `worker_payout:<batch id>` event with the admin reconcile route.
- A submitted batch is paid only when `verify_transaction` confirms a USDC
  transfer of the batch amount from the payout wallet to the worker. A reverted
  transaction returns the intents to `accrued`; a confirmed transaction that
  does not contain that transfer marks the batch `uncertain`.

### API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/jobs/{job_id}/payouts` | The job's budget, committed, paid and pending totals, and every fragment's intent with its status or withheld reason (job owner or admin) |
| GET | `/api/v1/marketplace/worker/{worker_id}/earnings` | Adds `pending_earnings`, `paid_fragments` and `withheld_fragments`; `total_earned` grows as batches are confirmed |

### Collections

| Collection | Contents | Unique on |
| --- | --- | --- |
| `payout_intents` | One per fragment: worker, amount, status, reason, batch, tx hash | `intent_key` |
| `payout_budgets` | Guard: the job's hold, `remaining` and `committed` | `job_id` |
| `payout_batches` | One per transfer: worker, amount, intents, status, tx hash | `batch_id` |

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `QB2_WORKER_PAYOUT_WALLET` | unset | Platform wallet that sends payouts. Unset: accrue only |
| `QB2_WORKER_PAYOUT_THRESHOLD` | `1` | Send once a worker's accrued USDC reaches this |
| `QB2_WORKER_PAYOUT_MAX_AGE_SECONDS` | `86400` | …or once their oldest unpaid fragment is this old |
| `QB2_WORKER_PAYOUT_INTERVAL_SECONDS` | `300` | How often the settler runs; `0` disables it |
| `QB2_WORKER_PAYOUT_MIN_FIDELITY` | `0` | Fragments below this observed fidelity are not paid |

The payout wallet must hold Base Sepolia USDC and a little ETH for gas. Paying
workers needs `QB2_CIRCUIT_JOB_CREDIT_COST` above 0, since that hold is the budget.

## Tests

```bash
uv run pytest tests/unit/test_payment_ledger_models.py tests/unit/test_payments_admin_api.py tests/unit/test_credits_api.py
uv run pytest tests/unit/test_fragment_payouts.py tests/unit/test_fragment_payouts_api.py
# Frontend webhook and credit-pack tests:
(cd ../frontend && bun run test:billing)
# Idempotency and concurrency need a real server (disposable local MongoDB only):
QB2_MONGODB_TEST_URI=mongodb://127.0.0.1:27017 uv run pytest tests/live -q
```

The live tests cover replayed keys, concurrent confirms, concurrent holds that
would overspend, concurrent double captures and releases, rebuilding a lost hold
guard, drift detection, randomized concurrent traffic that must keep guards equal
to ledger sums, and the payout paths (paid once, never retried when uncertain).
`tests/live/test_credits_mongo.py` covers credit purchases delivered twice or
concurrently, the two events of one async session, crash recovery, and job
metering that charges only completed jobs.
`tests/live/test_fragment_payouts_mongo.py` covers replayed and concurrent fragments,
budget caps under concurrency, withheld reasons and reputation, partial charges for
failed jobs, threshold and age batching, and every settlement outcome.
