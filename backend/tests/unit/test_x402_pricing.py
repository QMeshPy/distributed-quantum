from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from quantum_backend_v2.api.deps.marketplace import get_marketplace_service
from quantum_backend_v2.api.routers.x402 import build_x402_router
from quantum_backend_v2.payments.models import PaymentEventStatus
from quantum_backend_v2.payments.x402_pricing import quote_circuit

CIRCUIT = 'OPENQASM 2.0; include "qelib1.inc"; qreg q[2]; h q;'


def estimator(total="0.0250001"):
    service = AsyncMock()
    service.estimate_job_cost.return_value = {
        "total_usdc": total,
        "breakdown": [{"operation": "hadamard", "price_per_op": "0.01", "count": 2}],
    }
    return service


@pytest.mark.anyio
@pytest.mark.parametrize(
    "total,expected", [("0", "0.010000"), ("0.0250001", "0.025001"), ("20", "1.000000")]
)
async def test_quote_bounds_and_atomic_rounding(total, expected):
    service = estimator(total)
    result = await quote_circuit(CIRCUIT, service, floor=Decimal("0.01"), cap=Decimal("1"))
    assert result["amount"] == expected
    service.estimate_job_cost.assert_awaited_once_with("h q;h q")


@pytest.mark.anyio
@pytest.mark.parametrize("total", ["NaN", "Infinity", "-0.1"])
async def test_invalid_estimates_fail_closed(total):
    with pytest.raises(RuntimeError):
        await quote_circuit(CIRCUIT, estimator(total), floor=Decimal("0.01"), cap=Decimal("1"))


@pytest.mark.anyio
async def test_missing_worker_price_cannot_produce_a_partial_quote():
    service = estimator()
    service.estimate_job_cost.return_value["breakdown"].append({"error": "No workers available"})
    with pytest.raises(RuntimeError, match="unavailable"):
        await quote_circuit(CIRCUIT, service, floor=Decimal("0.01"), cap=Decimal("1"))


@pytest.mark.anyio
@pytest.mark.parametrize(
    "circuit",
    ["invalid circuit", 'OPENQASM 2.0; include "/etc/passwd";', "OPENQASM 2.0; qreg q[1];"],
)
async def test_invalid_or_empty_circuits_do_not_reach_the_estimator(circuit):
    service = estimator()
    with pytest.raises(ValueError):
        await quote_circuit(circuit, service, floor=Decimal("0.01"), cap=Decimal("1"))
    service.estimate_job_cost.assert_not_awaited()


@pytest.mark.anyio
async def test_large_registers_are_rejected_before_qasm_expansion(monkeypatch):
    from unittest.mock import Mock

    from quantum_backend_v2.payments import x402_pricing

    parser = Mock()
    monkeypatch.setattr(x402_pricing.qasm2, "loads", parser)
    with pytest.raises(ValueError, match="limits"):
        await quote_circuit(
            'OPENQASM 2.0; include "qelib1.inc"; qreg q[1000000000]; h q;',
            estimator(),
            floor=Decimal("0.01"),
            cap=Decimal("1"),
        )
    parser.assert_not_called()


def test_internal_quote_requires_gateway_secret():
    app = FastAPI()
    service = estimator()
    app.dependency_overrides[get_marketplace_service] = lambda: service
    app.include_router(build_x402_router(gateway_secret="test-gateway-secret", ledger=None))
    with TestClient(app) as client:
        assert (
            client.post(
                "/api/v1/internal/x402/circuits/estimate", json={"circuit": CIRCUIT}
            ).status_code
            == 401
        )
        service.estimate_job_cost.assert_not_awaited()
        result = client.post(
            "/api/v1/internal/x402/circuits/estimate",
            json={"circuit": CIRCUIT},
            headers={"X-X402-Gateway-Secret": "test-gateway-secret"},
        )
        assert result.status_code == 200, result.text
        assert result.json()["amount"] == "0.025001"


def test_only_confirmed_payments_activate_the_recorded_job():
    ledger = AsyncMock()
    ledger.confirm.return_value = SimpleNamespace(
        job_id="job-recorded", status=PaymentEventStatus.CONFIRMED
    )
    jobs = AsyncMock()
    jobs.activate_paid_job.side_effect = [True, False]
    app = FastAPI()
    app.include_router(
        build_x402_router(gateway_secret="test-gateway-secret", ledger=ledger, job_service=jobs)
    )
    body = {
        "payment_id": "a" * 64,
        "network": "eip155:84532",
        "amount": "0.01",
        "asset": "usdc-token",
        "payer": "payer",
        "receiver": "receiver",
        "job_id": "job-untrusted",
        "status": "confirmed",
        "transaction": "transaction",
    }
    with TestClient(app) as client:
        endpoint = "/api/v1/internal/x402/payments"
        assert client.post(endpoint, json=body).status_code == 401
        ledger.confirm.assert_not_awaited()
        headers = {"X-X402-Gateway-Secret": "test-gateway-secret"}
        assert (
            client.post(endpoint, json={**body, "transaction": None}, headers=headers).status_code
            == 422
        )
        assert client.post(endpoint, json=body, headers=headers).status_code == 200
        assert client.post(endpoint, json=body, headers=headers).status_code == 200
    jobs.process.assert_awaited_once_with("job-recorded")
