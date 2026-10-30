"""Pricing and settings for pay-per-fragment worker payouts (#8)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from pydantic import ValidationError

from quantum_backend_v2.config.models import AppSettings, WorkerPayoutSettings
from quantum_backend_v2.payments.payouts import (
    FragmentOutcome,
    FragmentPayoutService,
    WithheldReason,
    intent_key,
    operation_type,
)

D = Decimal
WORKER = {
    "worker_id": "worker-1",
    "wallet_address": "0x" + "1" * 40,
    "pricing": {"hadamard": 0.25, "cnot": 0.5},
}


def _service(min_fidelity: float = 0.9) -> FragmentPayoutService:
    # Pricing touches no collection, so a plain mapping stands in for the database.
    database = {
        name: None
        for name in ("payout_intents", "payout_budgets", "worker_pricing", "peer_enrollments")
    }
    return FragmentPayoutService(database, ledger=None, min_fidelity=min_fidelity)  # type: ignore[arg-type]


def _outcome(**fields: object) -> FragmentOutcome:
    values: dict[str, object] = {
        "job_id": "job-1",
        "fragment_id": "frag-1",
        "peer_id": "peer-1",
        "operation_text": "h q[0]",
        "status": "completed",
        "observed_fidelity": 0.99,
    }
    values.update(fields)
    return FragmentOutcome(**values)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("h q[0]", "hadamard"),
        ("CX q[0],q[1]", "cnot"),
        ("rx(0.5) q[0]", "rotation_x"),
        ("u3(0.1,0.2,0.3) q[0]", "custom"),
        ("", "custom"),
    ],
)
def test_operation_types_match_marketplace_pricing_keys(text: str, expected: str) -> None:
    assert operation_type(text) == expected


def test_intent_keys_name_the_job_and_fragment() -> None:
    assert intent_key("job-1", "frag-7") == "fragment:job-1:frag-7"


def test_completed_fragment_is_priced_by_its_operation() -> None:
    service = _service()
    assert service._price(_outcome(), WORKER, "hadamard") == (D("0.25"), None)
    assert service._price(_outcome(), WORKER, "cnot") == (D("0.5"), None)


def test_custom_price_covers_unlisted_operations() -> None:
    worker = {**WORKER, "pricing": {"custom": 0.1}}
    assert _service()._price(_outcome(), worker, "swap") == (D("0.1"), None)


@pytest.mark.parametrize(
    ("outcome", "worker", "reason"),
    [
        (_outcome(status="failed"), WORKER, WithheldReason.FRAGMENT_FAILED),
        (_outcome(status="not_run"), WORKER, WithheldReason.JOB_FAILED),
        (_outcome(observed_fidelity=0.5), WORKER, WithheldReason.FIDELITY_REJECTED),
        (_outcome(), None, WithheldReason.UNKNOWN_WORKER),
        (_outcome(), {**WORKER, "wallet_address": None}, WithheldReason.UNKNOWN_WORKER),
        (_outcome(), {**WORKER, "pricing": {"cnot": 1}}, WithheldReason.UNPRICED),
        (_outcome(), {**WORKER, "pricing": {"hadamard": 0}}, WithheldReason.UNPRICED),
    ],
)
def test_unpayable_fragments_are_withheld(
    outcome: FragmentOutcome, worker: dict[str, object] | None, reason: WithheldReason
) -> None:
    assert _service()._price(outcome, worker, "hadamard") == (D("0"), reason)


def test_fragments_without_a_fidelity_reading_are_not_rejected() -> None:
    assert _service()._price(_outcome(observed_fidelity=None), WORKER, "hadamard")[1] is None


def test_payout_settings_default_to_accruing_without_sending() -> None:
    settings = AppSettings.from_env({})
    assert settings.worker_payouts == WorkerPayoutSettings()
    assert settings.worker_payouts.wallet_address is None
    assert settings.worker_payouts.threshold == D("1")


def test_payout_settings_read_the_environment() -> None:
    settings = AppSettings.from_env(
        {
            "QB2_WORKER_PAYOUT_MIN_FIDELITY": "0.8",
            "QB2_WORKER_PAYOUT_WALLET": "0x" + "a" * 40,
            "QB2_WORKER_PAYOUT_THRESHOLD": "2.5",
            "QB2_WORKER_PAYOUT_MAX_AGE_SECONDS": "600",
            "QB2_WORKER_PAYOUT_INTERVAL_SECONDS": "0",
        }
    ).worker_payouts
    assert settings.min_fidelity == 0.8
    assert settings.wallet_address == "0x" + "a" * 40
    assert settings.threshold == D("2.5")
    assert settings.max_age_seconds == 600
    assert settings.interval_seconds == 0


def test_payout_wallet_must_be_an_address() -> None:
    with pytest.raises(ValidationError):
        WorkerPayoutSettings(wallet_address="not-an-address")
