"""Anchor checks against a real local EVM node; skipped unless QB2_ANVIL_RPC_URL is set.

Start one with Sepolia's chain ID so registry chain checks apply unchanged:
    docker run --rm -p 127.0.0.1:8545:8545 ghcr.io/foundry-rs/foundry:stable \\
        "anvil --host 0.0.0.0 --chain-id 11155111"
No key is hard-coded: each test funds a fresh account through anvil's dev API.
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from beanie import init_beanie
from eth_account import Account
from pymongo import AsyncMongoClient
from web3 import Web3

from quantum_backend_v2 import chains
from quantum_backend_v2.application.anchoring import (
    STUCK_SECONDS,
    AnchorUnavailableError,
    EvmAnchorChain,
    ProvenanceAnchorService,
    RegistryAnchorAdapter,
)
from quantum_backend_v2.chains.anchor import AnchorPayload, EvmAnchorAdapter
from quantum_backend_v2.chains.loader import load_chain_registry
from quantum_backend_v2.persistence.mongodb import (
    AnchorBatchDocument,
    AnchorLeaseDocument,
    ProvenanceBundleDocument,
)
from quantum_backend_v2.provenance.hashing import bundle_hash
from quantum_backend_v2.provenance.merkle import MerkleTree
from quantum_backend_v2.provenance.models import ChainAnchor, ProvenanceBundle
from quantum_backend_v2.provenance.verification import (
    RunEvidence,
    build_result_bundle,
    verify_bundle,
)

RPC_URL = os.environ.get("QB2_ANVIL_RPC_URL")
pytestmark = pytest.mark.skipif(not RPC_URL, reason="set QB2_ANVIL_RPC_URL to a local anvil")
SEPOLIA = load_chain_registry().resolve("ethereum-sepolia")
ENV = {SEPOLIA.rpc_env_var: RPC_URL or ""}
SCRIPT = Path(__file__).parents[2] / "scripts" / "verify_anchor.py"


@pytest.fixture
def web3():
    client = Web3(Web3.HTTPProvider(RPC_URL))
    assert client.eth.chain_id == 11155111, "start anvil with --chain-id 11155111"
    return client


def funded_account(web3):
    account = Account.create()
    web3.provider.make_request("anvil_setBalance", [account.address, hex(10**18)])
    return account


def send_anchor(web3, account, payload: AnchorPayload, *, to=None) -> str:
    transaction = {
        "chainId": 11155111,
        "nonce": web3.eth.get_transaction_count(account.address),
        "to": to or account.address,
        "value": 0,
        "data": payload.encode(),
        "gas": 30_000,
        "maxFeePerGas": web3.to_wei(5, "gwei"),
        "maxPriorityFeePerGas": web3.to_wei(1, "gwei"),
    }
    signed = account.sign_transaction(transaction)
    tx_hash = web3.eth.send_raw_transaction(signed.raw_transaction)
    web3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)
    return "0x" + bytes(tx_hash).hex()


def finalize(web3):
    # anvil reports `finalized` a fixed number of blocks behind the head.
    web3.provider.make_request("anvil_mine", [hex(100)])


def test_real_anchor_transaction_is_confirmed_only_once_finalized(web3):
    account = funded_account(web3)
    payload = AnchorPayload("ab" * 32, 7)
    tx_hash = send_anchor(web3, account, payload)
    adapter = EvmAnchorAdapter(SEPOLIA, web3)
    assert adapter.check_anchor(tx_hash, payload, account.address).status == "pending"
    finalize(web3)
    assert adapter.check_anchor(tx_hash, payload, account.address).status == "confirmed"
    assert receipt_gas(web3, tx_hash) < 23_000
    # Same transaction, but a different claimed batch size or sender is not this anchor.
    assert adapter.check_anchor(tx_hash, AnchorPayload("ab" * 32, 8), account.address).status == (
        "mismatch"
    )
    other = funded_account(web3)
    assert adapter.check_anchor(tx_hash, payload, other.address).status == "mismatch"


def receipt_gas(web3, tx_hash: str) -> int:
    return int(web3.eth.get_transaction_receipt(tx_hash)["gasUsed"])


def test_a_payload_sent_to_another_address_is_not_an_anchor(web3):
    account = funded_account(web3)
    payload = AnchorPayload("cd" * 32, 2)
    tx_hash = send_anchor(web3, account, payload, to=funded_account(web3).address)
    finalize(web3)
    assert EvmAnchorAdapter(SEPOLIA, web3).check_anchor(
        tx_hash, payload, account.address
    ).status == ("mismatch")


def run(run_id: str) -> RunEvidence:
    return RunEvidence(
        run_id=run_id,
        workflow_definition_id="circuit-execution",
        owner_user_id="owner-1",
        input_snapshot={"circuit": "h q[0];"},
        plan_id="plan-1",
        result={
            "job_id": run_id,
            "fragment_results": [{"fragment_id": "frag-1"}],
            "quantum_result": {"probabilities": {"0": 1.0}},
        },
    )


def test_script_and_adapter_verify_a_real_batch(web3, tmp_path):
    created = datetime(2026, 10, 29, tzinfo=timezone.utc)
    bundles = [build_result_bundle(run(f"workflow-{i}"), created_at=created) for i in range(5)]
    tree = MerkleTree([bundle_hash(bundle) for bundle in bundles])
    account = funded_account(web3)
    tx_hash = send_anchor(web3, account, AnchorPayload(tree.root, 5))
    anchor_of = lambda index: ChainAnchor(  # noqa: E731
        chain=SEPOLIA.chain_id,
        tx_hash=tx_hash,
        merkle_root=tree.root,
        leaf_index=index,
        leaf_count=5,
        proof=tree.proof(index).siblings,
    )
    adapter = RegistryAnchorAdapter(SEPOLIA, account.address, ENV)
    with pytest.raises(AnchorUnavailableError):
        asyncio.run(adapter.contains_root(anchor_of(4)))
    finalize(web3)
    assert all(asyncio.run(adapter.contains_root(anchor_of(i))) for i in range(5))

    def verify(bundle) -> subprocess.CompletedProcess[str]:
        path = tmp_path / "bundle.json"
        path.write_text(
            json.dumps(
                {"bundle": bundle.model_dump(mode="json"), "bundle_hash": bundle_hash(bundles[3])}
            )
        )
        return subprocess.run(
            [sys.executable, str(SCRIPT), str(path), "--sender", account.address],
            env={**os.environ, **ENV},
            capture_output=True,
            text=True,
            timeout=60,
        )

    anchored = bundles[3].model_copy(update={"anchors": (anchor_of(3),)})
    passed = verify(anchored)
    assert passed.returncode == 0, passed.stdout + passed.stderr
    assert "PASS eip155:11155111" in passed.stdout and "leaf 4 of 5" in passed.stdout
    # A changed bundle no longer matches its commitment or its proof.
    tampered = anchored.model_copy(update={"artifact_refs": ("changed",)})
    assert verify(tampered).returncode == 1
    wrong_leaf = bundles[3].model_copy(update={"anchors": (anchor_of(2),)})
    assert verify(wrong_leaf).returncode == 1


def test_script_uses_the_configured_chain_registry(web3, tmp_path):
    bundle = build_result_bundle(run("workflow-registry"), created_at=datetime.now(timezone.utc))
    tree = MerkleTree([bundle_hash(bundle)])
    account = funded_account(web3)
    tx_hash = send_anchor(web3, account, AnchorPayload(tree.root, 1))
    finalize(web3)
    anchored = bundle.model_copy(
        update={
            "anchors": (
                ChainAnchor(
                    chain=SEPOLIA.chain_id,
                    tx_hash=tx_hash,
                    merkle_root=tree.root,
                    leaf_index=0,
                    leaf_count=1,
                    proof=(),
                ),
            )
        }
    )
    path = tmp_path / "bundle.json"
    path.write_text(json.dumps({"bundle": anchored.model_dump(mode="json")}))
    # Only the custom registry knows to reach this node through QB2_CUSTOM_ANCHOR_RPC_URL.
    packaged = Path(chains.__file__).parent / "registry.toml"
    custom = tmp_path / "registry.toml"
    custom.write_text(
        packaged.read_text(encoding="utf-8").replace(
            'rpc_env_var = "QB2_ETHEREUM_SEPOLIA_RPC_URL"',
            'rpc_env_var = "QB2_CUSTOM_ANCHOR_RPC_URL"',
        ),
        encoding="utf-8",
    )
    done = subprocess.run(
        [sys.executable, str(SCRIPT), str(path), "--sender", account.address],
        env={
            **os.environ,
            "QB2_CHAIN_REGISTRY_PATH": str(custom),
            "QB2_CUSTOM_ANCHOR_RPC_URL": RPC_URL or "",
            # The packaged registry would use this unreachable node instead.
            "QB2_ETHEREUM_SEPOLIA_RPC_URL": "http://127.0.0.1:9",
        },
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert done.returncode == 0, done.stdout + done.stderr
    assert "PASS eip155:11155111" in done.stdout


MONGODB_URI = os.environ.get("QMESH_TEST_MONGODB_URI")
needs_mongo = pytest.mark.skipif(not MONGODB_URI, reason="also needs QMESH_TEST_MONGODB_URI")


def with_mongo(scenario):
    async def run_scenario():
        client = AsyncMongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        name = "qmesh_anchor_e2e_" + uuid4().hex
        try:
            await init_beanie(
                database=client[name],
                document_models=[
                    ProvenanceBundleDocument,
                    AnchorBatchDocument,
                    AnchorLeaseDocument,
                ],
            )
            await scenario()
        finally:
            await client.drop_database(name)
            await client.close()

    asyncio.run(run_scenario())


async def store(runs) -> None:
    created = datetime(2026, 10, 29, tzinfo=timezone.utc)
    for item in runs:
        bundle = build_result_bundle(item, created_at=created)
        await ProvenanceBundleDocument(
            bundle_id=bundle.bundle_id,
            workflow_run_id=item.run_id,
            payload=bundle.model_dump(mode="json"),
            content_hash=bundle_hash(bundle),
        ).insert()


async def assert_verified(runs, sender: str) -> None:
    adapters = {SEPOLIA.chain_id: RegistryAnchorAdapter(SEPOLIA, sender, ENV)}
    for item in runs:
        doc = await ProvenanceBundleDocument.find_one({"workflow_run_id": item.run_id})
        bundle = ProvenanceBundle.model_validate(doc.payload)
        report = await verify_bundle(
            bundle, expected_hash=doc.content_hash, run=item, anchor_adapters=adapters
        )
        assert report.status == "verified", report.checks


@needs_mongo
def test_scheduler_anchors_stored_bundles_end_to_end(web3):
    account = funded_account(web3)
    runs = [run(f"workflow-e2e-{i}") for i in range(6)]

    async def scenario():
        await store(runs)
        service = ProvenanceAnchorService(
            EvmAnchorChain(SEPOLIA, account, ENV, max_fee_wei=100 * 10**9),
            chain_id=SEPOLIA.chain_id,
            sender=account.address,
        )
        assert await service.run_once() == "pending"
        finalize(web3)
        assert await service.run_once() == "anchored"
        assert await service.run_once() == "idle"
        batch = await AnchorBatchDocument.find_one({"status": "anchored"})
        receipt = web3.eth.get_transaction_receipt(batch.tx_hash)
        assert receipt["status"] == 1 and receipt["gasUsed"] < 23_000
        assert batch.block_number == receipt["blockNumber"]
        await assert_verified(runs, account.address)

    with_mongo(scenario)


@needs_mongo
def test_a_stuck_anchor_is_replaced_on_a_real_node(web3):
    account = funded_account(web3)
    runs = [run(f"workflow-stuck-{i}") for i in range(3)]
    clock = [datetime.now(timezone.utc)]

    async def scenario():
        await store(runs)
        service = ProvenanceAnchorService(
            EvmAnchorChain(SEPOLIA, account, ENV, max_fee_wei=100 * 10**9),
            chain_id=SEPOLIA.chain_id,
            sender=account.address,
            now=lambda: clock[0],
        )
        web3.provider.make_request("evm_setAutomine", [False])
        try:
            assert await service.run_once() == "pending"  # Sitting in the mempool.
            clock[0] += timedelta(seconds=STUCK_SECONDS + 1)
            assert await service.run_once() == "pending"  # Outbid at the same nonce.
            batch = await AnchorBatchDocument.find_one({"open": True})
            first, second = (attempt["tx_hash"] for attempt in batch.attempts)
            web3.provider.make_request("evm_mine", [])
        finally:
            web3.provider.make_request("evm_setAutomine", [True])
        finalize(web3)
        assert await service.run_once() == "anchored"
        anchored = await AnchorBatchDocument.find_one({"status": "anchored"})
        # The node accepted the replacement, so it is the mined transaction.
        assert anchored.tx_hash == second != first
        await assert_verified(runs, account.address)

    with_mongo(scenario)
