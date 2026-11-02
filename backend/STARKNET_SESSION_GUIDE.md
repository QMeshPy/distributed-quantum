# Starknet Session Setup Guide

**Quick-start guide for collaborators to test agent spending policies on Starknet Sepolia.**

Create a session for one agent, have the Ready owner register it, and test a spend. The stored session key is not a signer.

---

## What This Does

Agent budget caps (`max_per_proposal`, `daily_budget`) map onto on-chain `max_per_call` and `daily_limit` per agent row in `SpendingPolicy`. The backend stores a session key encrypted with `WALLET_ENCRYPTION_KEY` and puts the public key in `register_session`.

| Acceptance criterion (`FEAT_STARKNET_SPENDING_POLICIES.md`) | Implementation |
|---|---|
| Agent transacts within policy and is rejected on-chain beyond it | When an agent has an active Starknet session and funds a proposal with `researcher_starknet_wallet`, `ai_agent_service._execute_funding` signs a session-key `spend` over `(agent_key, payee, amount, nonce, contract, chain_id)` and the backend relayer submits it. Over-cap, expired, or revoked calls revert on-chain with no Base USDC fallback. Agents without an active session keep the Base USDC transfer. |
| Session keys can be revoked and expire automatically | Ready owner signs `revoke_session`, and `expires_at` is checked on every `spend`. Register and revoke UI remain available on Sepolia and mainnet. |
| Policy parameters map to existing agent config fields | `max_per_proposal` and `daily_budget` map to `max_per_call` and `daily_limit` on that agent's storage row (`agent_key`) when `register_session` is called. |

Groq, OpenRouter, and NEAR chat replies are not capped by this contract.

The policy contract checks on each agent's row (`agent_key`):

- **Authorization** — either the Ready owner is the caller and `payee` equals the row's `recipient` (Sepolia **Get STRK** withdrawal), or `check_ecdsa_signature` verifies `session_public_key` over `(agent_key, payee, amount, nonce, contract, chain_id)`
- **Nonce** — `nonce` must match the row's current nonce and increments on every successful spend
- **Per-call limit** — one spend cannot exceed `max_per_call`
- **Daily limit** — the row's `spent_today` cannot exceed `daily_limit` (owner **Get STRK** and agent session spends share the same `spent_today` and `nonce`)
- **Expiry** — session expires at `expires_at`
- **Revocation** — `revoke_session` sets `revoked` on that agent's row after the owner transaction is accepted

Until `STARKNET_SESSION_KEY_SPEND=1` and `STARKNET_POLICY_CONTRACT` point to the newly deployed per-agent contract class, the backend emits the legacy 8-felt `register_session`, 2-felt `spend(amount)`, and 0-felt `revoke_session` calldata so the existing owner-only contract (`0x04f1882a…`) continues to work without breaking changes.

Spend preflight calls the same checks and does **not** write `spent_today`. Repeating preflight does not reduce the budget. The on-chain counter is the one that counts. A confirmed spend receipt does not write `spent_today` in the database either.

Revoke sets `revocation_pending`. It does not set `revoked`. The card says **Revoking** until a receipt check sees execution `SUCCEEDED` and finality `ACCEPTED_ON_L2` or `ACCEPTED_ON_L1`. L2 acceptance is what the UI treats as confirmed. L1 settlement is slower and is not required.

---

## Prerequisites

### Tools
- **Ready wallet** — funded with Sepolia STRK. The app connects it with starknetkit.
- **Backend** — `uv run quantum-backend --host 127.0.0.1 --port 8081` from `distributed-quantum/backend`
- **Frontend** — `pnpm dev` from `distributed-quantum/frontend` (pnpm 11)
- **curl** + **python3** — only if you call the API directly

### Deployed Contracts (Starknet Sepolia)

| Component | Address | Link |
|-----------|---------|------|
| **Policy Contract** | `0x04f1882a972a276e27b423cfadd29d24a75e798b60cc7d8d4b536ebe0741aaa4` | [Voyager](https://sepolia.voyager.online/contract/0x04f1882a972a276e27b423cfadd29d24a75e798b60cc7d8d4b536ebe0741aaa4) |
| **Ready Owner** | `0x026a705Ae4dB69a318E5b6ce945a7c47776da45f5F281aB0E0A43A13D91FF0fc` | Klein on Sepolia |
| **STRK Token** | `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d` | [Docs](https://docs.starknet.io/resources/chain-info/) |

Returned calls use `STARKNET_POLICY_CONTRACT`. If that variable is unset, open, spend, and revoke return **503**.

### Backend Environment

Required in `backend/.env`:

```bash
AGENT_AUTH_BRIDGE_SECRET=
WALLET_ENCRYPTION_KEY=
QB2_STARKNET_SEPOLIA_RPC_URL=https://starknet-sepolia-rpc.publicnode.com
STARKNET_POLICY_CONTRACT=
STARKNET_SESSION_KEY_SPEND=
STARKNET_RELAYER_ADDRESS=
STARKNET_RELAYER_PRIVATE_KEY=
AVNU_PAYMASTER_API_KEY=
```

`QB2_STARKNET_SEPOLIA_RPC_URL` must be a live RPC (publicnode or `https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10`). The chain registry default is `https://starknet-sepolia-rpc.publicnode.com`. The old Blast URL (`starknet-sepolia.public.blastapi.io`) returns **403** — set the env var explicitly if receipt polling still hits Blast after a restart.

AVNU (`https://sepolia.paymaster.avnu.fi`) may sponsor `register_session` only. The open response includes a `paymaster` JSON body for that call. The app does not submit it. Spend and revoke are paid by Ready. `revoke` returns `paymaster_sponsored: false`.

### STRK Funding

1. **Ready** pays gas for the invokes the app sends (register, spend, revoke).
2. **Policy contract** must hold STRK. `spend` transfers from the contract balance to the recipient.

Get testnet STRK: [starknet-faucet](https://www.diadata.org/map/web3-builder-hub/starknet-faucets/)

---

## In the app

### 1. Open a session

On **Agents**, a card without a session shows **Open Starknet Session**.

| Field | Default |
|-------|---------|
| Max per proposal (STRK) | 50 |
| Daily budget (STRK) | 200 |
| Expires in (days) | 90 |

**Connect Ready Wallet** uses starknetkit. The address is `connectorData.account`. **Open Session** posts that address as `owner`, STRK as `token`, and the same address as `recipient`, with `decimals: 18`. Caps are the dialog strings, not the raw agent config, when you submit the form.

The API returns **201** and stores the session before Ready approves. Canceling the prompt leaves that stored session. Opening again replaces it and mints a new `session_public_key`.

Ready then signs `register_session` with `wallet_addInvokeTransaction`. The app appends the hash as `kind: "register"`.

The card then shows **Starknet Session**:

- **Max / proposal** and **Daily limit** in STRK (`formatStrk` with the session decimals, 18). These are not raw fri.
- Status **Active**, **Revoking**, **Expired**, or **Revoked**.
- **Txn History**, **Get STRK** (Sepolia only), and **Revoke** while the status is Active. On mainnet (`starknet:SN_MAIN`), only **Register** and **Revoke** are shown.

A successful open redirects to `/agents/chat?agentId=…`.

### 2. Get STRK (Sepolia owner withdrawal) and Agent Proposal Funding

On Sepolia, **Get STRK** asks for an amount in STRK. The backend preflights caps and returns `spend` calldata. Ready signs `spend`, pulling STRK from the policy contract into the connected Ready wallet up to that agent's per-call and daily budget. If preflight returns `daily`, the dialog displays the remaining daily budget and a link to `https://faucet.starknet.io/` (Sepolia only; the faucet funds a wallet and does not reset the policy contract's daily cap).

When an agent with an active Starknet session funds a proposal in `ai_agent_service._execute_funding`:
- The proposal must specify `researcher_starknet_wallet` (a valid Starknet felt address). If `researcher_starknet_wallet` is missing while the session is active, funding raises an error and does **not** fall back to Base USDC.
- The backend decrypts the agent's session key, signs `(agent_key, payee, amount, nonce, contract, chain_id)`, and submits `spend` via the relayer account (`STARKNET_RELAYER_ADDRESS` / `STARKNET_RELAYER_PRIVATE_KEY`).
- STRK is transferred from the policy contract to `researcher_starknet_wallet`, recorded on `starknet_session.calls`, and added to `budget_raised_strk` on the proposal (keeping `budget_raised` in USDC separate so currencies are never mixed).
- Agents without an active Starknet session continue to fund proposals in Base USDC via `agentkit_service.transfer_usdc`.

### 3. Revoke

**Revoke** asks Ready to sign `revoke_session` (empty calldata). The API sets `revocation_pending` before the wallet returns. The card switches to **Revoking** and shows “Revocation is waiting on the Ready transaction.” Test Spend and Revoke hide until the status is Active again.

`revoked` becomes true only after `POST …/starknet-session/txs` sees the revoke receipt `SUCCEEDED` and `ACCEPTED_ON_L2` or `ACCEPTED_ON_L1`. The UI label is then **Revoked**.

### 4. Transaction history

**Txn History** is on the agent card. The chat header shows the same caps, Test Spend, and Revoke, and does not show the history button.

The dialog title is Transaction history. Empty copy is **No records yet.** Otherwise each row is register, spend, or revoke:

| Receipt value | Label |
|---------------|--------|
| `pending` | Pending |
| `not_found` | Submitted |
| `confirmed` | Confirmed |
| `failed` | Failed |

A spend row with an amount reads `Spend {amount} STRK`. The hash is a truncated Voyager link. The other column is the formatted `submitted_at`, or an em dash when that field is missing.

Each submitted hash is appended to `starknet_session.calls`. `POST /api/v1/agents/{id}/starknet-session/txs` refreshes calls that are not confirmed or failed, via `StarknetRpcAdapter.verify_transaction` (`starknet_getTransactionReceipt`). Confirmed and failed stop. A confirmed spend does not write `spent_today`. A confirmed revoke sets `revoked` and clears `revocation_pending`.

A mounted session panel checks each open call about 2.5 minutes, 4.5 minutes, and 5.5 minutes after `submitted_at`, so the card can leave **Revoking** without the dialog. While Transaction history is open, it checks about once a minute until Confirmed or Failed. Confirmed means L2 acceptance (`ACCEPTED_ON_L2` or `ACCEPTED_ON_L1`). Block numbers from the RPC may be hex. This is not a 30–45 minute poll.

### 5. Chat stays on the agent

Chat sessions are per agent. `/agents/chat` lists and restores transcripts whose `agentId` matches the agent in the URL. Switching agents drops another agent’s open transcript. A new agent does not show another agent’s messages.

### 6. How much was spent (which wallet, where to look)

There are three separate balances. Do not mix them when reading chat or Voyager.

| Rail | Wallet row | What spends | Where to see amounts |
|------|------------|-------------|----------------------|
| **Base Sepolia (USDC)** | `entity_type: "agent"` — CDP wallet for the agent id | Agent chat **fund proposal** (when no active Starknet session path), or other AgentKit transfers | Agent chat tool **get_wallet** (USDC + ETH). Base Sepolia explorer for the agent address on the card. |
| **Base Sepolia (USDC)** | `entity_type: "user"` — CDP wallet for the logged-in owner | Not used for Starknet. Required as **researcher wallet** on proposals (escrow metadata). | Created lazily on first `create_proposal`; no charge to submit a proposal. `POST /api/v1/wallet` or first successful proposal create provisions it. |
| **Starknet STRK** | Policy contract (`STARKNET_POLICY_CONTRACT`) | **Get STRK**, session-key agent funding to `researcher_starknet_wallet`, relayer-submitted spends | **Txn History** on the agent card: each confirmed **Spend {amount} STRK** row. Voyager: policy contract STRK balance down, recipient up. On-chain `spent_today` and `nonce` on that agent row (authoritative for daily cap; DB `spent_today` is not updated on receipt confirm). |

**Creating a proposal in chat** (`create_proposal`) does **not** move USDC or STRK. The table in chat (`0 / 500 USDC raised`) is crowdfunding progress, not a debit from your wallet.

**Ready wallet** pays **gas only** for register / owner Get STRK / revoke invokes you sign in the browser. STRK payout amounts come from the **policy contract** balance, not from Ready’s STRK balance (except gas fees).

---

## Platform pitfalls (researcher wallet and Pending receipts)

Two issues show up often in local dev. Both are backend/configuration, not “insufficient funds” on the agent card.

### Researcher wallet not found (agent chat `create_proposal`)

**Symptom:** Chat tool fails with `Researcher wallet not found for {owner_id}` even though **get_wallet** shows the **agent** has USDC on Base.

**Cause:** Proposals attach to the **owner’s user wallet** (`entity_id` = logged-in user, `entity_type: "user"`). Creating an agent only provisions an **agent** wallet. Signup does not auto-create a user wallet.

**Fix (code):** `ProposalService.create_proposal` calls `AgentKitService.create_wallet(entity_id=researcher_id, entity_type="user")` when that row is missing — same path as `POST /api/v1/wallet`.

**What you should see after fix:** Backend log `No user wallet for researcher …; provisioning via AgentKit`, then `Created wallet … for user:…`. Retry **create_proposal** in chat (no manual wallet UI step required).

### Txn History stuck on Pending while Voyager shows Accepted on L2

**Symptom:** Register / spend rows stay **Pending** in **Txn History**; `POST …/starknet-session/txs` returns **200** but status never becomes **Confirmed**.

**Cause:** Receipt refresh calls `starknet_getTransactionReceipt` through `resolve_rpc_url`. A dead RPC (historically Blast **403**) makes `httpx` fail; `refresh_call_statuses` catches the error and **leaves the call pending** (no 503 on the whole request).

**Fix:** Set `QB2_STARKNET_SEPOLIA_RPC_URL=https://starknet-sepolia-rpc.publicnode.com` (or Cartridge `/rpc/v0_10`) in `backend/.env`, **restart** `quantum-backend`, then open **Txn History** again (~1/min poll while open) or wait for the card’s 2.5 / 4.5 / 5.5 minute receipt timers.

**Verify:** Backend logs should show successful HTTP to publicnode on `/txs`, not `blastapi.io … 403`. Warning lines `Starknet receipt check failed for 0x…` mean RPC still failing.

---

## API

The app calls these through Next.js (`/api/agentkit/agents/{id}/starknet-session…`). Direct curl needs a `qn1.` bridge token. Better Auth cookies are not `Authorization: Bearer`. With `QB2_AUTH_REQUIRED=false`, a non-`qn1.` bearer is ignored and you are `dev-local`, which returns **403** unless `sub` is the agent `owner_id`.

Mint a 60s token from `distributed-quantum/backend`. Replace `sub` with the agent owner id from the UI.

```bash
cd /path/to/distributed-quantum/backend

TOKEN=$(uv run python - <<'PY'
import base64, hashlib, hmac, json, time
from pathlib import Path
for line in Path(".env").read_text().splitlines():
    if line.startswith("AGENT_AUTH_BRIDGE_SECRET="):
        secret = line.split("=", 1)[1].strip().strip('"')
        break
else:
    raise SystemExit("AGENT_AUTH_BRIDGE_SECRET missing in backend/.env")
now = int(time.time())
payload = {
    "sub": "6ae21555e24ff257f6b952b9",  # Must match agent owner_id
    "email": "you@example.com",
    "iat": now,
    "exp": now + 60,
    "aud": "quantumnodes-agentkit",
}
body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).rstrip(b"=").decode()
sig = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
print(f"qn1.{body}.{sig}")
PY
)
```

List agents: `GET /api/v1/agents` with `Authorization: Bearer ${TOKEN}`. Example agent **Research Assistant**: `6b350343-a41f-41a0-a6b7-9e87f2b0503e`.

### Open — `POST /api/v1/agents/{id}/starknet-session` (201)

```bash
curl -s -X POST "http://127.0.0.1:8081/api/v1/agents/${AGENT_ID}/starknet-session" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "0x026a705Ae4dB69a318E5b6ce945a7c47776da45f5F281aB0E0A43A13D91FF0fc",
    "token": "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    "recipient": "0x026a705Ae4dB69a318E5b6ce945a7c47776da45f5F281aB0E0A43A13D91FF0fc",
    "expires_at": 1795794084,
    "decimals": 18
  }'
```

Omit `max_per_proposal` and `daily_budget` to use the agent config. The app sends both as strings.

`register_session.calldata` is eight felts. The two `0` values below are the high halves of the `u256` caps (50 and 200 STRK at 18 decimals):

```json
[
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  "0x026a705ae4db69a318e5b6ce945a7c47776da45f5f281ab0e0a43a13d91ff0fc",
  "50000000000000000000",
  "0",
  "200000000000000000000",
  "0",
  "1795794084",
  "0x…"
]
```

`register_session.contract` is `STARKNET_POLICY_CONTRACT`. `paymaster` is the AVNU body for this registration only.

| Error | Cause |
|-------|--------|
| **403** | Bearer is not `qn1.` or `sub` is not the agent owner |
| **400** | Expiry is not in the future, caps are inverted, or an address is invalid |
| **500** | starknet.py is missing `KeyPair.generate()` |
| **503** | `WALLET_ENCRYPTION_KEY` or `STARKNET_POLICY_CONTRACT` is unset, or starknet.py is not installed |

### Spend preflight — `POST …/starknet-session/spend` (200)

```bash
curl -s -X POST "http://127.0.0.1:8081/api/v1/agents/${AGENT_ID}/starknet-session/spend" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"amount": "1"}'
```

`amount` is whole token units (`"1"` is 1 STRK when `decimals` is 18). Calldata is `["1000000000000000000", "0"]`. This does not change `spent_today`. An amount over `max_per_call` returns **400** `per_call`. Over the remaining day total returns **400** `daily`.

### Note a hash — `POST …/starknet-session/tx` (200)

```json
{ "kind": "register", "tx_hash": "0x…" }
```

`kind` is `register`, `spend`, or `revoke`. Spend also requires a positive `amount`. The hash is appended to `calls` with `status: "pending"`. Caps and `revoked` stay as they were.

### Refresh receipts — `POST …/starknet-session/txs` (200)

No body. Non-terminal calls are checked. Confirmed and failed are left alone. RPC failure returns **503** `Starknet receipt lookup is unavailable`. That 503 is not the missing-contract 503.

### Revoke — `POST …/starknet-session/revoke` (200)

Returns `revoke_session` with empty calldata and the policy contract. The stored session has `revocation_pending: true` and `status: "revocation_pending"`. `revoked` is still false.

---

## On-chain (Voyager)

Use the calldata from the 201 you just created. A newer open invalidates it.

Do not send `register_session` from the starkli deployer account. That account pays declare and deploy. The policy owner is the Ready address, and any other caller reverts `owner`.

1. [Policy contract](https://sepolia.voyager.online/contract/0x04f1882a972a276e27b423cfadd29d24a75e798b60cc7d8d4b536ebe0741aaa4) → Write → `register_session`.
2. Connect Ready at the `owner` address.
3. Voyager’s form takes the full `u256` (`max_per_call`, `daily_limit` from `starknet_session`). Raw calldata is the eight felts, low then high.
4. For `spend`, the form amount is the full base-unit integer (1 STRK = `1000000000000000000`). Raw calldata is that integer’s low felt, then high felt.
5. `revoke_session` has no arguments.

Fund the **policy contract** with Sepolia STRK before `spend`. Registration and funding can happen in either order. Both have to be done before a transfer succeeds. Confirm the contract balance on Voyager.

Optional: submit the open response’s `paymaster` object to [AVNU Sepolia](https://sepolia.paymaster.avnu.fi/) if you want that **register** sponsored. The app path does not do this.

---

## Quick Checklist

| Step | Verification |
|------|----------------|
| Backend up | `GET /api/v1/health` returns 200 |
| Policy env set | Open does not return 503 |
| Session stored | 201 includes `starknet_session` and eight-felt `register_session.calldata` |
| Ready signed register | Txn History shows the register hash |
| Policy funded | Contract STRK balance on Voyager |
| Preflight | Spend returns calldata; repeating it leaves `spent_today` unchanged |
| Owner spend | Voyager receipt succeeds; recipient balance increases |
| Revoke | Card says Revoking, then Revoked only after a confirmed revoke receipt |

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| **403** | Wrong `qn1` `sub` | Mint again with the agent `owner_id` |
| **500** `from_random` | starknet.py &lt; 0.30 | `uv add starknet.py` in `backend`, restart |
| **503** on open | `WALLET_ENCRYPTION_KEY` or `STARKNET_POLICY_CONTRACT` unset, or starknet.py is not installed | Set both env vars, restart |
| **503** on spend or revoke | `STARKNET_POLICY_CONTRACT` unset | Set the deployed policy address, restart |
| **503** on `…/txs` | Receipt RPC failed (whole refresh aborted) | Set `QB2_STARKNET_SEPOLIA_RPC_URL` to publicnode or Cartridge `/rpc/v0_10`, restart |
| Txn History **Pending** forever, Voyager **Accepted on L2** | Receipt RPC failed per hash (often Blast **403**); `/txs` still **200** | Same RPC env + restart; reopen Txn History. See **Platform pitfalls** above |
| **`Researcher wallet not found`** in chat `create_proposal` | No `entity_type: "user"` wallet for owner | Retry after lazy provision (see **Platform pitfalls**); agent USDC wallet is unrelated |
| Revert **owner** | Signer is not the constructor owner | Sign with Ready `0x026a…F0fc` |
| Revert **expired** | `expires_at` is in the past | Open again with a future expiry |
| Revert **per_call** | Amount or cap is above the per-call max, or caps are inverted | Amount ≤ max/proposal ≤ daily budget |
| Revert **daily** | On-chain day total would pass `daily_limit` | Wait for the next unix day (`timestamp // 86400`) or open a new session |
| Revert **revoked** | Owner revoke is already accepted | Open a new session |
| Revert **transfer** | Contract STRK balance is too low | Send STRK to the policy contract |
| `unknown block tag 'pending'` | starkli on a non-v0.8 RPC | Account deploy only: Cartridge `/rpc/v0_8`. See `REVVING_UP_STARKNET.md` |

---

## Who signs what

```
Ready owner
  register_session, spend, revoke_session
  (starknetkit → wallet_addInvokeTransaction)
        │
        ▼
Policy contract  0x04f1882a…aaa4
  caps, expiry, session_public_key, revoked, spent_today
  spend transfers STRK from the contract to recipient
        │
        ▼
Backend
  encrypts the session private key (never returned)
  returns calldata; preflight does not persist spent_today
  appends hashes; receipt refresh confirms or fails them
  sets revoked only after a confirmed revoke receipt
```

AVNU may sponsor `register_session` when you submit the `paymaster` body yourself. It does not sponsor `spend` or `revoke_session`.

---

## References

- [Starknet Chain Info](https://docs.starknet.io/resources/chain-info/)
- [Starknet Compatibility](https://docs.starknet.io/learn/cheatsheets/compatibility)
- [AVNU Paymaster](https://docs.avnu.fi/docs/paymaster/gasfree)
- [Voyager Sepolia](https://sepolia.voyager.online/)
- [Starknet Faucet](https://starknet-faucet.vercel.app/)
- `REVVING_UP_STARKNET.md` — Scarb, starkli, sncast, declare, deploy
- `backend/CHAIN_REGISTRY.md` — registry and RPC
- `backend/contracts/starknet/src/spending_policy.cairo` — contract source (comments only; this deploy was not replaced)

| Component | Address |
|-----------|---------|
| Policy contract | `0x04f1882a972a276e27b423cfadd29d24a75e798b60cc7d8d4b536ebe0741aaa4` |
| Class | `0x00a4e8f1b7461cc30324074ebf7320a07d20456a0f27ad33017f36dcd9565ff1` |
| STRK | `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d` |
| Ready owner | `0x026a705Ae4dB69a318E5b6ce945a7c47776da45f5F281aB0E0A43A13D91FF0fc` |

---

## For Maintainers: Auditing and Deploying the Updated Policy Contract

The original Sepolia contract (`0x04f1882a…`, class `0x00a4e8f1…`) has no upgrade entrypoint and stores a single session slot. Deploying the updated `SpendingPolicy` contract (`backend/contracts/starknet/src/spending_policy.cairo`) enables per-agent rows (`agent_key`) and session-key ECDSA verification in `spend`.

### Can you reuse the existing OpenZeppelin deployer account?

**Yes.** Reuse the same deployed OpenZeppelin account (`~/.starkli/sepolia/account.json` and `~/.starkli/sepolia/keystore.json`, e.g. `0x06be8842d0d8cd1660b029018e13cbba161b0db7cf7d687ee9ca36256a2b3d73`) to declare and deploy the new class, and reuse the same account (or a dedicated OpenZeppelin account) for `STARKNET_RELAYER_ADDRESS`. You do **not** need to deploy a new OpenZeppelin account.

### Gas and STRK balances required

1. **OpenZeppelin deployer / relayer account** (`0x06be8842…`): pays L2 gas in STRK for `sncast declare`, `sncast deploy`, and backend relayer `spend` calls. Keep **at least 3–5 STRK** on this account before running `declare` and `deploy`.
2. **Ready owner wallet** (`0x026a705A…`): pays gas when signing `register_session`, `revoke_session`, and Sepolia **Get STRK** in the browser.
3. **Deployed `SpendingPolicy` contract**: holds the STRK pool that `spend` transfers to `researcher_starknet_wallet` (for agent proposal funding) or to the Ready recipient (for Sepolia **Get STRK**). Transfer Sepolia STRK to the newly deployed contract address after step 3 below.

### Step 1: Audit and compile the Cairo contract

Verify the contract source and run the unit test suite before compiling:

```bash
cd distributed-quantum/backend/contracts/starknet
asdf set scarb 2.19.0
scarb clean && scarb build
python3 -c "import json; print(json.load(open('target/dev/spending_policy_SpendingPolicy.contract_class.json'))['sierra_program'][:3])"
```

Confirm the Sierra header output is `['0x1', '0x9', '0x0']` (Sierra 1.9.0, required by Sepolia). Then run the Python policy and calldata verification suite:

```bash
cd /path/to/distributed-quantum/backend
uv run pytest tests/unit/test_starknet_policy.py -v
```

### Step 2: Declare the new contract class with `sncast`

`starkli 0.4.2` cannot compile Sierra 1.9.5 CASM hashes for declare; use `sncast` (0.64.1+) with JSON-RPC `v0_10` (publicnode or Cartridge `/rpc/v0_10`) and your existing starkli keystore and account:

```bash
cd distributed-quantum/backend/contracts/starknet

# Optional fee preview without broadcasting:
sncast --keystore ~/.starkli/sepolia/keystore.json \
  --account ~/.starkli/sepolia/account.json \
  declare --contract-name SpendingPolicy \
  --url https://starknet-sepolia-rpc.publicnode.com \
  --dry-run

# Broadcast the declare transaction:
sncast --keystore ~/.starkli/sepolia/keystore.json \
  --account ~/.starkli/sepolia/account.json \
  declare --contract-name SpendingPolicy \
  --url https://starknet-sepolia-rpc.publicnode.com
```

Copy the new `class_hash` from the output (it will differ from the legacy `0x00a4e8f1…` hash).

### Step 3: Deploy the new `SpendingPolicy` instance

Pass your Ready owner address as the single constructor argument:

```bash
cd distributed-quantum/backend/contracts/starknet

sncast --keystore ~/.starkli/sepolia/keystore.json \
  --account ~/.starkli/sepolia/account.json \
  deploy --class-hash <NEW_CLASS_HASH> \
  --constructor-calldata 0x026a705Ae4dB69a318E5b6ce945a7c47776da45f5F281aB0E0A43A13D91FF0fc \
  --url https://starknet-sepolia-rpc.publicnode.com
```

Copy the new `contract_address` from the deploy output.

### Step 4: Fund the new contract and cut over `backend/.env`

1. Send Sepolia STRK (`0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d`) from Ready or the Sepolia faucet to `<NEW_CONTRACT_ADDRESS>`.
2. Update `distributed-quantum/backend/.env`:
   - Set `STARKNET_POLICY_CONTRACT=<NEW_CONTRACT_ADDRESS>`
   - Set `STARKNET_SESSION_KEY_SPEND=1`
   - Set `STARKNET_RELAYER_ADDRESS` and `STARKNET_RELAYER_PRIVATE_KEY` to the funded OpenZeppelin account that submits session-key `spend` calls
3. Restart `uv run quantum-backend --host 127.0.0.1 --port 8081` and re-open the agent's Starknet session in the UI so `register_session` writes the agent's row (`agent_key`) on the new contract.

---

## Out of Scope in This Version

- Mainnet contract deployment (UI already hides **Get STRK** and the faucet link when `chain_id` is `starknet:SN_MAIN`).
- Automatic paymaster submission on `register_session` (the API returns the AVNU sponsor payload; Ready submits the transaction directly).
- Capping Groq, OpenRouter, or NEAR AI Cloud inference replies.

---

**Last Updated:** October 31, 2026
**Contract:** Sierra 1.9.0 (`spending_policy.cairo`, per-agent rows + session-key ECDSA `spend`)
**Network:** Starknet Sepolia
