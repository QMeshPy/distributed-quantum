"""CPU work must run outside the ASGI event-loop thread."""
import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from quantum_backend_v2.application import parity, real_options_pricing, risk_engine


@pytest.mark.anyio
@pytest.mark.parametrize("kind", ["finance", "options", "risk"])
@pytest.mark.parametrize("fails", [False, True])
async def test_job_compute_uses_worker_thread_and_keeps_result_semantics(monkeypatch, kind, fails):
    loop_thread = threading.get_ident()
    threads = []
    doc = SimpleNamespace(status="queued", request_payload=None, filename="test.csv",
                          result_payload=None, error=None, save=AsyncMock())

    def compute(*args, **kwargs):
        threads.append(threading.get_ident())
        if fails:
            raise ValueError("invalid compute input")
        return SimpleNamespace(payload={"row_count": 4}) if kind == "finance" else {"price": 12}

    if kind == "finance":
        model = parity.FinancialJobDocument
        service = parity.FinancialJobService(discovery_service=None, libp2p_runtime=None)
        monkeypatch.setattr(parity, "_config_from_doc", lambda _: None)
        monkeypatch.setattr(parity, "build_portfolio_optimization_artifacts", compute)
        kwargs = {"csv_bytes": b"data"}
    elif kind == "options":
        model = parity.OptionsJobDocument
        service = parity.OptionsJobService()
        monkeypatch.setattr(real_options_pricing, "price_options", compute)
        kwargs = {"request_payload": {}}
    else:
        model = parity.RiskJobDocument
        service = parity.RiskJobService()
        monkeypatch.setattr(risk_engine, "price_risk", compute)
        kwargs = {"request_payload": {}}
    monkeypatch.setattr(model, "get", AsyncMock(return_value=doc))

    await service.process(job_id="job-test", **kwargs)

    assert threads and threads[0] != loop_thread
    assert doc.status == ("failed" if fails else "completed")
    assert doc.error == ("invalid compute input" if fails else None)
    if not fails:
        assert doc.result_payload == ({"row_count": 4} if kind == "finance" else {"price": 12})


@pytest.mark.anyio
@pytest.mark.parametrize("kind", ["circuit", "finance", "tokenized", "options", "risk"])
async def test_all_submissions_persist_coordinator_ownership(monkeypatch, kind):
    from datetime import date

    monkeypatch.setattr(parity, "_ensure_platform_user", AsyncMock())
    monkeypatch.setattr(parity, "resolve_price_input", AsyncMock(return_value={}))
    monkeypatch.setattr(parity, "resolve_risk_prices", AsyncMock(return_value={}))
    if kind == "circuit":
        service = parity.CircuitJobService.__new__(parity.CircuitJobService)
        model_name = "WorkflowRunDocument"
        kwargs = {"circuit_text": "OPENQASM 2.0;"}
    elif kind in ("finance", "tokenized"):
        service = parity.FinancialJobService(discovery_service=None, libp2p_runtime=None,
                                            history_source=SimpleNamespace(market_data=None))
        model_name = "FinancialJobDocument"
        kwargs = {"filename": "portfolio.csv", "problem_type": "portfolio_optimization",
                  "config": parity.PortfolioOptimizationConfig()}
        if kind == "tokenized":
            monkeypatch.setattr(parity, "tokenized_request", lambda *args: {})
            kwargs = {"symbols": ["SPY"], "start": date(2026, 1, 1), "end": date(2026, 2, 1),
                      "config": parity.PortfolioOptimizationConfig()}
    elif kind == "options":
        service = parity.OptionsJobService()
        model_name = "OptionsJobDocument"
        kwargs = {"option_type": "call", "request_payload": {}}
    else:
        service = parity.RiskJobService()
        model_name = "RiskJobDocument"
        kwargs = {"risk_model": "credit", "portfolio_size": 1, "request_payload": {}}
    monkeypatch.setattr(parity, model_name, lambda **values: SimpleNamespace(
        **values, insert=AsyncMock()
    ))
    service.coordinator_peer_id = "coordinator-unique"
    submit = service.submit_tokenized if kind == "tokenized" else service.submit

    doc = await submit(owner_user_id="alice", **kwargs)

    assert doc.coordinator_peer_id == "coordinator-unique"
    assert doc.owner_user_id == "alice"
    doc.insert.assert_awaited_once()
