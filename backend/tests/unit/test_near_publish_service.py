"""Publish requests are owner-bound, single-use, and only accept the expected wallet's signature."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct

from services import near_publish

WALLET = Account.create()
MESSAGE = "QMesh provenance anchor\nSubmitter: " + WALLET.address


class Requests:
    def __init__(self, **overrides):
        self.doc = {
            "_id": "req-1",
            "owner_id": "owner-1",
            "bundle_ids": ["near-job-1"],
            "merkle_root": "ab" * 32,
            "submitter": WALLET.address,
            "message": MESSAGE,
            "status": "pending",
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
        } | overrides

    async def find_one_and_update(self, query, update):
        doc = self.doc
        if (
            doc["_id"] != query["_id"]
            or doc["owner_id"] != query["owner_id"]
            or doc["status"] != query["status"]
            or doc["expires_at"] <= query["expires_at"]["$gt"]
        ):
            return None
        snapshot = dict(doc)
        doc.update(update["$set"])
        return snapshot

    async def update_one(self, query, update):
        self.doc.update(update["$set"])


@pytest.fixture
def published(monkeypatch):
    calls = []
    settings = SimpleNamespace(private_key="set", contract_id="registry.testnet", publisher_id="p")

    async def manifest(collection, ids, settings_, submitter):
        return SimpleNamespace(
            merkle_root="ab" * 32,
            model_dump=lambda: {},
            contract_arguments=lambda: {"submitter": submitter},
        )

    class Publisher:
        def __init__(self, settings_):
            pass

        async def anchor(self, arguments):
            calls.append(arguments)
            return "T" * 44

    async def attach(*args):
        calls.append("attached")

    async def owned(*args):
        return []

    monkeypatch.setattr(near_publish, "near_settings", lambda: settings)
    monkeypatch.setattr(near_publish, "prepare_manifest", manifest)
    monkeypatch.setattr(near_publish, "owned_rows", owned)
    monkeypatch.setattr(near_publish, "NearPublisher", Publisher)
    monkeypatch.setattr(near_publish, "attach_manifest", attach)
    monkeypatch.setattr(
        near_publish.NearManifest,
        "model_validate",
        lambda data: SimpleNamespace(merkle_root="ab" * 32, contract_arguments=lambda: data),
    )
    monkeypatch.setattr(
        near_publish,
        "NearRegistryAdapter",
        lambda s: SimpleNamespace(
            explorer_url=lambda tx: "https://testnet.nearblocks.io/txns/" + tx
        ),
    )
    return calls


def _db(requests):
    return {near_publish.REQUESTS: requests, "provenance_bundles": object()}


def _sign(account=WALLET):
    return account.sign_message(encode_defunct(text=MESSAGE)).signature.to_0x_hex()


def test_signed_publication_runs_once_and_links_the_explorer(published):
    requests = Requests()
    result = asyncio.run(
        near_publish.complete_publication(_db(requests), "owner-1", "req-1", _sign())
    )
    assert result["wallet_signed"] and result["explorer_url"].endswith("T" * 44)
    assert published[0]["submitter_signature"] == _sign() and published[-1] == "attached"
    assert requests.doc["status"] == "published"
    with pytest.raises(ValueError, match="already used"):
        asyncio.run(near_publish.complete_publication(_db(requests), "owner-1", "req-1", _sign()))


def test_wrong_wallet_or_owner_never_publishes_and_releases_the_claim(published):
    requests = Requests()
    with pytest.raises(ValueError, match="Sign with"):
        asyncio.run(
            near_publish.complete_publication(
                _db(requests), "owner-1", "req-1", _sign(Account.create())
            )
        )
    assert published == [] and requests.doc["status"] == "pending"
    with pytest.raises(ValueError, match="unknown"):
        asyncio.run(near_publish.complete_publication(_db(requests), "intruder", "req-1", _sign()))
    expired = Requests(expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    with pytest.raises(ValueError, match="expired"):
        asyncio.run(near_publish.complete_publication(_db(expired), "owner-1", "req-1", None))
