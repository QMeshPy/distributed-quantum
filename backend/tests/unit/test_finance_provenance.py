"""Finance evidence stays lossless across compact and historical representations."""

from copy import deepcopy
from datetime import datetime, timezone

import pytest
from bson import BSON

from quantum_backend_v2.application.finance_provenance import build_finance_provenance
from quantum_backend_v2.provenance.finance_inputs import restore_finance_inputs
from quantum_backend_v2.provenance.hashing import bundle_hash, canonical_json, hash_json
from quantum_backend_v2.provenance.models import ProvenanceBundle


def observation(**changes):
    return {
        "chain_id": "eip155:4663",
        "feed": "0x" + "ab" * 20,
        "pair": "spy-usd",
        "round_id": "18446744073709551617",
        "answer": "74244000000",
        "decimals": 8,
        "value": "742.44000000",
        "observed_at": "2026-06-22T01:20:43+00:00",
        "block_number": 100355076,
        "block_hash": "0x" + "cd" * 32,
        **changes,
    }


def evidence(inputs):
    return build_finance_provenance(
        "finance-test", "owner", inputs, {"value": 123}, workflow="portfolio-optimization"
    )


def test_compact_inputs_preserve_order_duplicates_and_exact_json_values():
    first = observation()
    second = observation(feed="0x" + "ef" * 20, pair="qqq-usd", block_number=100355077)
    inputs = {"csv_text": "date,SPY,QQQ\n", "price_observations": [first, second, first] * 8}
    before = deepcopy(inputs)
    stored = evidence(inputs)
    bundle = ProvenanceBundle.model_validate(stored["bundle"])
    assert bundle.summary["input_encoding"] == "chainlink-observations-v1"
    assert len(bundle.summary["inputs"]["price_observations"]["contexts"]) == 2
    assert "price_observations" not in bundle.summary
    assert canonical_json(restore_finance_inputs(bundle)) == canonical_json(inputs)
    assert inputs == before
    assert bundle_hash(bundle) == stored["bundle_hash"]
    assert bundle.summary["result_hash"] == hash_json({"value": 123})
    assert [ref.feed for ref in bundle.oracle_refs] == [
        item["chain_id"] + "/" + item["feed"] for item in inputs["price_observations"]
    ]
    reloaded = ProvenanceBundle.model_validate(BSON.encode(stored).decode()["bundle"])
    assert bundle_hash(reloaded) == stored["bundle_hash"]
    assert restore_finance_inputs(reloaded) == inputs
    inputs["price_observations"][0]["value"] = "1"
    assert restore_finance_inputs(bundle) == before


@pytest.mark.parametrize("field", ["price_observation", "price_observations"])
def test_small_inputs_keep_plain_representation(field):
    inputs = {field: observation() if field == "price_observation" else [observation()]}
    bundle = ProvenanceBundle.model_validate(evidence(inputs)["bundle"])
    assert "input_encoding" not in bundle.summary
    assert bundle.summary["inputs"] == inputs
    assert restore_finance_inputs(bundle) == inputs


@pytest.mark.parametrize("block_number", [True, 1.0, "1"])
def test_grouping_does_not_coerce_metadata_types(block_number):
    with pytest.raises(ValueError):
        evidence(
            {
                "price_observations": [
                    observation(block_number=1),
                    observation(block_number=block_number),
                ]
                * 10,
            }
        )


def test_legacy_bundle_is_read_without_rewriting_its_commitment():
    inputs = {"price_observations": [observation()] * 10}
    legacy = ProvenanceBundle(
        bundle_id="legacy",
        workflow_run_id="legacy-job",
        workflow_definition_id="risk-analysis",
        owner_user_id="owner",
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        input_hash=hash_json(inputs),
        summary={"inputs": inputs, "price_observations": inputs["price_observations"]},
    )
    before = canonical_json(legacy.model_dump(mode="json"))
    digest = bundle_hash(legacy)
    restored = restore_finance_inputs(legacy)
    assert restored == inputs
    restored["price_observations"].clear()
    assert canonical_json(legacy.model_dump(mode="json")) == before
    assert bundle_hash(legacy) == digest


@pytest.mark.parametrize(
    "mutation", ["value", "metadata", "reorder", "drop", "context", "negative", "unknown", "extra"]
)
def test_modified_or_malformed_compact_inputs_are_rejected(mutation):
    stored = evidence({"price_observations": [observation(round_id=str(i)) for i in range(10)]})
    bundle = ProvenanceBundle.model_validate(stored["bundle"])
    table = bundle.summary["inputs"]["price_observations"]
    if mutation == "value":
        table["rows"][0]["value"] = "1"
    elif mutation == "metadata":
        table["contexts"][0]["block_hash"] = "0x" + "ef" * 32
    elif mutation == "reorder":
        table["rows"].reverse()
    elif mutation == "drop":
        table["rows"].pop()
    elif mutation == "context":
        table["rows"][0]["context"] = len(table["contexts"])
    elif mutation == "negative":
        table["rows"][0]["context"] = -1
    elif mutation == "unknown":
        bundle.summary["input_encoding"] = "future-format"
    else:
        table["rows"][0]["ignored"] = True
    assert bundle_hash(bundle) != stored["bundle_hash"]
    with pytest.raises(ValueError):
        restore_finance_inputs(bundle)


@pytest.mark.parametrize("assets,days", [(5, 90), (9, 90), (9, 251)])
def test_history_sized_bundles_shrink_without_changing_input_commitment(assets, days):
    inputs = {
        "price_observations": [
            observation(feed="0x" + f"{asset:040x}", round_id=str((1 << 64) + day))
            for asset in range(assets)
            for day in range(days)
        ]
    }
    compact = evidence(inputs)
    legacy = deepcopy(compact)
    summary = legacy["bundle"]["summary"]
    summary.pop("input_encoding")
    summary["inputs"] = inputs
    summary["price_observations"] = inputs["price_observations"]
    assert len(canonical_json(compact)) < len(canonical_json(legacy)) * 0.5
    assert len(BSON.encode(compact)) < len(BSON.encode(legacy)) * 0.5
    assert restore_finance_inputs(ProvenanceBundle.model_validate(compact["bundle"])) == inputs
