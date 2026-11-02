"""Offline checks for the Starknet session policy, paymaster gate, and read adapter."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest

from quantum_backend_v2.chains.loader import load_chain_registry
from quantum_backend_v2.chains.starknet import (
    SN_SEPOLIA_CHAIN_ID,
    StarknetExplorerAdapter,
    StarknetRpcAdapter,
)
from quantum_backend_v2.starknet.calldata import (
    register_session_calldata,
    register_session_field_names,
    revoke_session_calldata,
    spend_calldata,
    u256_felts,
)
from quantum_backend_v2.starknet.paymaster import (
    PaymasterSponsorError,
    build_sponsor_request,
    sponsored_call,
)
from quantum_backend_v2.starknet.policy import (
    PolicyRejectedError,
    agent_key_from_id,
    authorize,
    authorize_row,
    policy_from_agent_config,
    revoke,
    sign_session_spend,
)
from quantum_backend_v2.starknet.session import (
    apply_call_status,
    encrypt_session_key,
    generate_session_keypair,
    note_submitted_tx,
    public_session,
    refresh_call_statuses,
    session_document,
    submit_session_spend,
)

OWNER = "0x1"
TOKEN = "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
OTHER = "0x2"
NOW = 1_700_000_000


def _policy(**overrides):
    values = dict(
        max_per_proposal=Decimal("10"),
        daily_budget=Decimal("25"),
        owner=OWNER,
        token=TOKEN,
        recipient=OTHER,
        expires_at=NOW + 200_000,
        session_public_key="0xabc",
        decimals=6,
        now=NOW,
    )
    values.update(overrides)
    return policy_from_agent_config(**values)


def test_config_fields_map_onto_per_call_and_daily_caps():
    policy = _policy()
    assert policy.max_per_call == 10_000_000
    assert policy.daily_limit == 25_000_000
    assert policy.revoked is False


def test_spend_within_policy_then_reject_per_call_and_daily_and_rollover():
    policy = _policy()
    once = authorize(policy, amount=10_000_000, token=TOKEN, recipient=OTHER, now=NOW)
    assert once.spent_today == 10_000_000
    with pytest.raises(PolicyRejectedError, match="per_call"):
        authorize(once, amount=10_000_001, token=TOKEN, recipient=OTHER, now=NOW)
    twice = authorize(once, amount=10_000_000, token=TOKEN, recipient=OTHER, now=NOW)
    with pytest.raises(PolicyRejectedError, match="daily"):
        authorize(twice, amount=10_000_000, token=TOKEN, recipient=OTHER, now=NOW)
    next_day = authorize(twice, amount=10_000_000, token=TOKEN, recipient=OTHER, now=NOW + 86_400)
    assert next_day.spent_today == 10_000_000


def test_expiry_revoke_and_target_are_rejected():
    policy = _policy()
    with pytest.raises(PolicyRejectedError, match="expired"):
        authorize(policy, amount=1, token=TOKEN, recipient=OTHER, now=policy.expires_at)
    with pytest.raises(PolicyRejectedError, match="revoked"):
        authorize(revoke(policy), amount=1, token=TOKEN, recipient=OTHER, now=NOW)
    with pytest.raises(PolicyRejectedError, match="token"):
        authorize(policy, amount=1, token=OWNER, recipient=OTHER, now=NOW)
    with pytest.raises(PolicyRejectedError, match="recipient"):
        authorize(policy, amount=1, token=TOKEN, recipient=OWNER, now=NOW)


def test_contract_reverts_with_the_same_codes():
    contract = Path(__file__).resolve().parents[2] / "contracts/starknet/src/spending_policy.cairo"
    source = contract.read_text()
    for code in ("per_call", "daily", "expired", "revoked"):
        assert f"'{code}'" in source
    assert "fn spend" in source and "fn revoke_session" in source


def test_paymaster_sponsors_registration_only():
    request = build_sponsor_request(
        entrypoint="register_session",
        account_address=OWNER,
        contract_address=TOKEN,
        calldata=["0x1"],
    )
    assert request["method"] == "paymaster_buildTransaction"
    assert request["params"]["execution_mode"] == "sponsored"
    assert request["params"]["invoke"]["calls"][0]["contractAddress"] == TOKEN
    for entrypoint in ("spend", "revoke_session", "register_session_admin"):
        with pytest.raises(PaymasterSponsorError, match="onboarding only"):
            build_sponsor_request(
                entrypoint=entrypoint,
                account_address=OWNER,
                contract_address=TOKEN,
                calldata=[],
            )


def test_sponsored_call_sends_the_key_header():
    seen = {}

    def post(url, body, headers):
        seen["url"] = url
        seen["header"] = headers["x-paymaster-api-key"]
        return {"ok": True}

    result = sponsored_call(
        entrypoint="deploy_account",
        account_address=OWNER,
        contract_address=TOKEN,
        calldata=[],
        api_key="portal-key",
        post=post,
    )
    assert result == {"ok": True}
    assert seen["url"] == "https://sepolia.paymaster.avnu.fi"
    assert seen["header"] == "portal-key"


def test_generate_session_keypair_returns_hex_pair():
    private_hex, public_hex = generate_session_keypair()
    assert 1 <= len(private_hex) <= 64
    int(private_hex, 16)
    assert public_hex.startswith("0x")
    assert 3 <= len(public_hex) <= 66
    int(public_hex, 16)


def test_u256_calldata_matches_the_contract_abi():
    policy = _policy(agent_id="agent-1")
    source = (
        Path(__file__).resolve().parents[2] / "contracts/starknet/src/spending_policy.cairo"
    ).read_text()
    signature = source.split("fn register_session", 1)[1].split(")", 1)[0]
    for name in register_session_field_names(session_key_spend=True):
        assert name in signature
    assert register_session_calldata(policy) == [
        policy.token,
        policy.recipient,
        "10000000",
        "0",
        "25000000",
        "0",
        str(policy.expires_at),
        policy.session_public_key,
    ]
    assert register_session_calldata(policy, session_key_spend=True) == [
        policy.agent_key,
        policy.token,
        policy.recipient,
        "10000000",
        "0",
        "25000000",
        "0",
        str(policy.expires_at),
        policy.session_public_key,
    ]
    assert spend_calldata(10_000_000) == ["10000000", "0"]
    assert spend_calldata(
        10_000_000,
        agent_key=policy.agent_key,
        payee=OTHER,
        nonce=3,
        signature=(11, 22),
        session_key_spend=True,
    ) == [policy.agent_key, "10000000", "0", OTHER, "3", "0xb", "0x16"]
    assert revoke_session_calldata() == []
    assert revoke_session_calldata(policy.agent_key, session_key_spend=True) == [policy.agent_key]
    assert u256_felts((1 << 128) + 7) == ["7", "1"]


def test_repeated_preflight_does_not_reduce_the_budget():
    policy = _policy()
    first = authorize(policy, amount=10_000_000, token=TOKEN, recipient=OTHER, now=NOW)
    second = authorize(policy, amount=10_000_000, token=TOKEN, recipient=OTHER, now=NOW)
    assert policy.spent_today == 0
    assert first.spent_today == second.spent_today == 10_000_000


def test_revoke_request_stays_pending_until_the_chain_confirms(monkeypatch):
    monkeypatch.setenv("WALLET_ENCRYPTION_KEY", "test-secret")
    stored = session_document(_policy(), encrypt_session_key("aa"), decimals=6)
    stored["revocation_pending"] = True
    visible = public_session(stored, now=NOW)
    assert visible is not None
    assert visible["status"] == "revocation_pending"
    assert visible["revoked"] is False


def test_noted_tx_is_visible_and_does_not_change_the_budget(monkeypatch):
    monkeypatch.setenv("WALLET_ENCRYPTION_KEY", "test-secret")
    stored = session_document(_policy(), encrypt_session_key("aa"), decimals=18)
    spent = stored["spent_today"]
    noted = note_submitted_tx(stored, kind="spend", tx_hash="0xabc", amount="1", now=NOW)
    noted = note_submitted_tx(noted, kind="register", tx_hash="0xdef", now=NOW)
    visible = public_session(noted, now=NOW)
    assert visible is not None
    assert noted["spent_today"] == spent
    assert noted["revoked"] is False
    assert visible["status"] == "active"
    assert visible["last_spend_tx"] == "0xabc"
    assert visible["calls"][0]["kind"] == "spend"
    assert visible["calls"][0]["status"] == "pending"
    assert visible["calls"][1]["tx_hash"] == "0xdef"
    with pytest.raises(ValueError):
        note_submitted_tx(stored, kind="spend", tx_hash="not-a-hash", amount="1", now=NOW)


def test_confirmed_revoke_receipt_marks_the_session_revoked(monkeypatch):
    monkeypatch.setenv("WALLET_ENCRYPTION_KEY", "test-secret")
    stored = session_document(_policy(), encrypt_session_key("aa"), decimals=18)
    stored["revocation_pending"] = True
    noted = note_submitted_tx(stored, kind="revoke", tx_hash="0xabc", now=NOW)
    refreshed = refresh_call_statuses(noted, lambda _tx: "confirmed", now=NOW + 5)
    visible = public_session(refreshed, now=NOW + 5)
    assert visible is not None
    assert visible["status"] == "revoked"
    assert visible["calls"][0]["status"] == "confirmed"
    assert refreshed["spent_today"] == stored["spent_today"]


def test_confirmed_spend_receipt_does_not_change_the_budget(monkeypatch):
    monkeypatch.setenv("WALLET_ENCRYPTION_KEY", "test-secret")
    stored = session_document(_policy(), encrypt_session_key("aa"), decimals=18)
    noted = note_submitted_tx(stored, kind="spend", tx_hash="0xabc", amount="1", now=NOW)
    refreshed = apply_call_status(noted, tx_hash="0xabc", status="confirmed", now=NOW + 5)
    visible = public_session(refreshed, now=NOW + 5)
    assert visible is not None
    assert visible["status"] == "active"
    assert refreshed["spent_today"] == stored["spent_today"]
    assert visible["calls"][0]["status"] == "confirmed"


def test_public_session_omits_the_private_key(monkeypatch):
    monkeypatch.setenv("WALLET_ENCRYPTION_KEY", "test-secret")
    policy = _policy()
    stored = session_document(policy, encrypt_session_key("aa"), decimals=6)
    visible = public_session(stored, now=NOW)
    assert visible is not None
    assert visible["status"] == "active"
    assert "session_key_encrypted" not in visible
    assert "aa" not in str(visible)


def test_registry_lists_starknet_sepolia_without_wallet_operations():
    chain = load_chain_registry().resolve("starknet-sepolia")
    assert chain.chain_id == "starknet:SN_SEPOLIA"
    assert chain.family == "starknet"
    assert chain.native_token.symbol == "STRK"
    assert set(chain.capabilities) == {"explorer_url", "verify_transaction"}
    assert chain.provider_aliases.agentkit is None


class _Rpc:
    def __init__(self, responses):
        self.responses = responses

    def request(self, method, params):
        value = self.responses[method]
        if isinstance(value, Exception):
            raise value
        return value


def test_adapter_confirms_success_and_rejects_a_reverted_receipt():
    chain = load_chain_registry().resolve("starknet:SN_SEPOLIA")
    tx = "0xabc"
    ok = StarknetRpcAdapter(
        chain,
        _Rpc(
            {
                "starknet_chainId": hex(SN_SEPOLIA_CHAIN_ID),
                "starknet_getTransactionReceipt": {
                    "execution_status": "SUCCEEDED",
                    "finality_status": "ACCEPTED_ON_L2",
                    "block_number": 10,
                },
                "starknet_blockNumber": 10,
            }
        ),
    )
    confirmed = ok.verify_transaction(tx)
    assert confirmed.status == "confirmed" and confirmed.confirmations == 1
    failed = StarknetRpcAdapter(
        chain,
        _Rpc(
            {
                "starknet_chainId": hex(SN_SEPOLIA_CHAIN_ID),
                "starknet_getTransactionReceipt": {
                    "execution_status": "REVERTED",
                    "block_number": 4,
                },
            }
        ),
    )
    assert failed.verify_transaction(tx).status == "failed"
    hex_receipt = StarknetRpcAdapter(
        chain,
        _Rpc(
            {
                "starknet_chainId": hex(SN_SEPOLIA_CHAIN_ID),
                "starknet_getTransactionReceipt": {
                    "execution_status": "SUCCEEDED",
                    "finality_status": "ACCEPTED_ON_L2",
                    "block_number": "0xa",
                },
                "starknet_blockNumber": "0xa",
            }
        ),
    )
    assert hex_receipt.verify_transaction(tx).status == "confirmed"
    url = StarknetExplorerAdapter(chain).explorer_url("transaction", tx)
    assert url == f"https://sepolia.voyager.online/tx/{tx}"


def test_per_agent_rows_isolate_budgets_and_share_counter_with_owner_get_strk():
    priv_a, pub_a = generate_session_keypair()
    priv_b, pub_b = generate_session_keypair()
    row_a = _policy(agent_id="agent-alpha", session_public_key=pub_a)
    row_b = _policy(agent_id="agent-beta", session_public_key=pub_b)
    assert row_a.agent_key != row_b.agent_key
    rows = {row_a.agent_key: row_a, row_b.agent_key: row_b}
    contract = "0x4f1882a972a276e27b423cfadd29d24a75e798b60cc7d8d4b536ebe0741aaa4"
    payee = "0x333"

    # Owner Get STRK on row A uses 10M of row A's 25M daily budget and increments nonce to 1
    rows = authorize_row(
        rows,
        agent_key=row_a.agent_key,
        amount=10_000_000,
        token=TOKEN,
        payee=OTHER,
        now=NOW,
        caller=OWNER,
        nonce=0,
    )
    assert rows[row_a.agent_key].spent_today == 10_000_000
    assert rows[row_a.agent_key].nonce == 1
    assert rows[row_b.agent_key].spent_today == 0
    assert rows[row_b.agent_key].nonce == 0

    # Session-key spend on row A to proposal payee uses another 10M (total 20M <= 25M) and nonce 1 -> 2
    sig_a = sign_session_spend(
        priv_a,
        agent_key=row_a.agent_key,
        payee=payee,
        amount=10_000_000,
        nonce=1,
        contract=contract,
        chain_id=SN_SEPOLIA_CHAIN_ID,
    )
    rows = authorize_row(
        rows,
        agent_key=row_a.agent_key,
        amount=10_000_000,
        token=TOKEN,
        payee=payee,
        now=NOW,
        nonce=1,
        signature=sig_a,
        contract=contract,
        chain_id=SN_SEPOLIA_CHAIN_ID,
    )
    assert rows[row_a.agent_key].spent_today == 20_000_000
    assert rows[row_a.agent_key].nonce == 2
    assert rows[row_b.agent_key].spent_today == 0

    # Replay with nonce 1 on row A is rejected
    with pytest.raises(PolicyRejectedError, match="nonce"):
        authorize_row(
            rows,
            agent_key=row_a.agent_key,
            amount=5_000_000,
            token=TOKEN,
            payee=payee,
            now=NOW,
            nonce=1,
            signature=sig_a,
            contract=contract,
            chain_id=SN_SEPOLIA_CHAIN_ID,
        )

    # Wrong key (priv_b signing for row_a) is rejected
    bad_sig = sign_session_spend(
        priv_b,
        agent_key=row_a.agent_key,
        payee=payee,
        amount=5_000_000,
        nonce=2,
        contract=contract,
        chain_id=SN_SEPOLIA_CHAIN_ID,
    )
    with pytest.raises(PolicyRejectedError, match="signature"):
        authorize_row(
            rows,
            agent_key=row_a.agent_key,
            amount=5_000_000,
            token=TOKEN,
            payee=payee,
            now=NOW,
            nonce=2,
            signature=bad_sig,
            contract=contract,
            chain_id=SN_SEPOLIA_CHAIN_ID,
        )

    # Exceeding remaining daily budget (6M + 20M > 25M) on row A is rejected even with valid signature
    over_daily_sig = sign_session_spend(
        priv_a,
        agent_key=row_a.agent_key,
        payee=payee,
        amount=6_000_000,
        nonce=2,
        contract=contract,
        chain_id=SN_SEPOLIA_CHAIN_ID,
    )
    with pytest.raises(PolicyRejectedError, match="daily"):
        authorize_row(
            rows,
            agent_key=row_a.agent_key,
            amount=6_000_000,
            token=TOKEN,
            payee=payee,
            now=NOW,
            nonce=2,
            signature=over_daily_sig,
            contract=contract,
            chain_id=SN_SEPOLIA_CHAIN_ID,
        )

    # Row B still has its full 25M daily budget untouched
    sig_b = sign_session_spend(
        priv_b,
        agent_key=row_b.agent_key,
        payee=payee,
        amount=10_000_000,
        nonce=0,
        contract=contract,
        chain_id=SN_SEPOLIA_CHAIN_ID,
    )
    rows = authorize_row(
        rows,
        agent_key=row_b.agent_key,
        amount=10_000_000,
        token=TOKEN,
        payee=payee,
        now=NOW,
        nonce=0,
        signature=sig_b,
        contract=contract,
        chain_id=SN_SEPOLIA_CHAIN_ID,
    )
    assert rows[row_b.agent_key].spent_today == 10_000_000


@pytest.mark.anyio
async def test_execute_funding_uses_session_spend_when_active_and_never_falls_back_to_usdc(monkeypatch):
    from bson import Decimal128
    from unittest.mock import AsyncMock, MagicMock, Mock
    import services.ai_agent_service as agents_module

    monkeypatch.setenv("WALLET_ENCRYPTION_KEY", "test-secret")
    monkeypatch.setenv(
        "STARKNET_POLICY_CONTRACT",
        "0x04f1882a972a276e27b423cfadd29d24a75e798b60cc7d8d4b536ebe0741aaa4",
    )
    priv, pub = generate_session_keypair()
    policy = policy_from_agent_config(
        max_per_proposal=Decimal("10"),
        daily_budget=Decimal("25"),
        owner=OWNER,
        token=TOKEN,
        recipient=OWNER,
        expires_at=int(Decimal("2000000000")),
        session_public_key=pub,
        decimals=18,
        now=NOW,
        agent_id="agent-strk",
    )
    stored_session = session_document(policy, encrypt_session_key(priv), decimals=18)

    db = MagicMock()
    agent_doc = {
        "agent_id": "agent-strk",
        "wallet_address": "0x" + "11" * 20,
        "total_spent": Decimal128("0"),
        "config": {"max_per_proposal": Decimal128("10"), "daily_budget": Decimal128("25")},
        "starknet_session": stored_session,
        "spending_history": [],
    }
    proposal_doc = {
        "proposal_id": "prop-1",
        "researcher_wallet": "0x" + "22" * 20,
        "researcher_starknet_wallet": "0x0555",
        "budget_raised": Decimal128("0"),
        "budget_raised_strk": Decimal128("0"),
    }
    db.ai_agents.find_one = AsyncMock(return_value=agent_doc)
    db.ai_agents.update_one = AsyncMock()
    db.research_proposals.find_one = AsyncMock(return_value=proposal_doc)
    db.research_proposals.update_one = AsyncMock()

    motor = MagicMock()
    motor.return_value.__getitem__.return_value = db
    monkeypatch.setattr(agents_module, "AsyncIOMotorClient", motor)

    wallet = Mock()
    wallet.transfer_usdc = AsyncMock()
    submitted_calls = []

    async def fake_submit(contract, calldata, *, chain_id):
        submitted_calls.append((contract, calldata, chain_id))
        return "0xdeadbeef"

    service = agents_module.AIAgentService(
        agentkit_service=wallet, starknet_submit_fn=fake_submit
    )
    await service._execute_funding("agent-strk", "prop-1", Decimal("4"))
    wallet.transfer_usdc.assert_not_awaited()
    assert len(submitted_calls) == 1
    assert submitted_calls[0][1][0] == agent_key_from_id("agent-strk")
    assert submitted_calls[0][1][3] == "0x555"

    # Over-cap session spend fails before submit and does NOT fall back to Base USDC
    with pytest.raises(PolicyRejectedError, match="per_call"):
        await service._execute_funding("agent-strk", "prop-1", Decimal("15"))
    wallet.transfer_usdc.assert_not_awaited()

    # Missing researcher_starknet_wallet while session is active raises ValueError and does NOT fall back to USDC
    proposal_doc["researcher_starknet_wallet"] = None
    with pytest.raises(ValueError, match="researcher_starknet_wallet"):
        await service._execute_funding("agent-strk", "prop-1", Decimal("2"))
    wallet.transfer_usdc.assert_not_awaited()

