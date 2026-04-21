from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from quantum_backend_v2.api.deps.auth import configure_auth
from quantum_backend_v2.api.errors.models import register_exception_handlers
from quantum_backend_v2.api.routers.financial import build_financial_router

pytestmark = pytest.mark.anyio


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class _StubFinancialJobService:
    def __init__(self) -> None:
        self.submit_calls: list[dict[str, object]] = []
        self.get_calls: list[dict[str, object]] = []
        self.list_calls: list[dict[str, object]] = []
        self.last_result_detail = "full"
        self.comparison_requests = 0

    async def submit(
        self,
        *,
        filename: str,
        owner_user_id: str,
        problem_type: str,
        config: object,
    ) -> SimpleNamespace:
        self.submit_calls.append(
            {
                "filename": filename,
                "owner_user_id": owner_user_id,
                "problem_type": problem_type,
                "config": config,
            }
        )
        return SimpleNamespace(
            id="fin-123",
            status="ingesting",
            result_payload={"problem_type": problem_type},
        )

    async def get_job(self, job_id: str, *, current_user: object) -> SimpleNamespace:
        user_id = getattr(current_user, "user_id", None)
        self.get_calls.append({"job_id": job_id, "user_id": user_id})
        now = _utc_now()
        return SimpleNamespace(
            id=job_id,
            filename="portfolio.csv",
            status="completed",
            row_count=48,
            col_count=6,
            error=None,
            result_payload={"problem_type": "portfolio_optimization"},
            created_at=now,
            updated_at=now,
        )

    async def list_jobs(self, *, current_user: object, limit: int) -> list[SimpleNamespace]:
        user_id = getattr(current_user, "user_id", None)
        self.list_calls.append({"user_id": user_id, "limit": limit})
        now = _utc_now()
        return [
            SimpleNamespace(
                id="fin-123",
                filename="portfolio.csv",
                status="completed",
                row_count=48,
                col_count=6,
                error=None,
                result_payload={"problem_type": "portfolio_optimization"},
                created_at=now,
                updated_at=now,
            )
        ]

    def get_problem_type(self, record: object) -> str | None:
        return "portfolio_optimization"

    def get_result_payload(self, record: object, *, detail: str = "full") -> dict[str, object]:
        self.last_result_detail = detail
        return {"detail": detail}

    def get_comparison_payload(self, record: object) -> dict[str, object] | None:
        self.comparison_requests += 1
        return {
            "job_id": getattr(record, "id", "fin-123"),
            "filename": getattr(record, "filename", "portfolio.csv"),
            "generated_at": _utc_now().isoformat(),
            "fairness": {"same_dataset": True},
            "dataset": {"asset_count": 6},
            "problem": {"budget": 3},
            "classical": {"bitstring": "101001"},
            "quantum": {"bitstring": "010110"},
            "scorecard": {"winner_by_objective": "classical"},
            "evidence": {"exact_baseline_available": True},
            "verdict": {"headline": "Workflow evidence"},
        }

    async def process(self, *, job_id: str, csv_bytes: bytes) -> None:
        return None


@pytest.fixture(autouse=True)
def _reset_auth() -> None:
    configure_auth(enabled=True, allow_dev_bearer_tokens=True)
    yield
    configure_auth(enabled=True, allow_dev_bearer_tokens=False)


@pytest.fixture
def app_and_service() -> tuple[FastAPI, _StubFinancialJobService]:
    service = _StubFinancialJobService()
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(build_financial_router(financial_job_service=service))
    return app, service


async def test_submit_financial_csv_requires_auth(app_and_service: tuple[FastAPI, _StubFinancialJobService]) -> None:
    app, _service = app_and_service

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/finance/submit",
            files={"file": ("portfolio.csv", b"date,ticker,close\n2024-01-01,AAPL,100\n", "text/csv")},
        )

    assert response.status_code == 401


async def test_submit_financial_csv_uses_authenticated_owner_id(
    app_and_service: tuple[FastAPI, _StubFinancialJobService],
) -> None:
    app, service = app_and_service

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/finance/submit",
            headers={"Authorization": "Bearer dev-alice"},
            data={
                "problem_type": "portfolio_optimization",
                "budget": "3",
                "risk_aversion": "0.7",
                "max_assets_considered": "5",
                "parameter_search_steps": "11",
            },
            files={"file": ("portfolio.csv", b"date,ticker,close\n2024-01-01,AAPL,100\n", "text/csv")},
        )

    assert response.status_code == 201
    assert response.json()["job_id"] == "fin-123"
    assert len(service.submit_calls) == 1
    assert service.submit_calls[0]["owner_user_id"] == "alice"
    assert service.submit_calls[0]["problem_type"] == "portfolio_optimization"


async def test_get_financial_job_forwards_summary_detail_and_user(
    app_and_service: tuple[FastAPI, _StubFinancialJobService],
) -> None:
    app, service = app_and_service

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/v1/finance/fin-123?result_detail=summary",
            headers={"Authorization": "Bearer dev-bob"},
        )

    assert response.status_code == 200
    assert response.json()["result"] == {"detail": "summary"}
    assert service.get_calls == [{"job_id": "fin-123", "user_id": "bob"}]
    assert service.last_result_detail == "summary"


async def test_list_financial_jobs_forwards_authenticated_user(
    app_and_service: tuple[FastAPI, _StubFinancialJobService],
) -> None:
    app, service = app_and_service

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/v1/finance?limit=5",
            headers={"Authorization": "Bearer dev-carol"},
        )

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert service.list_calls == [{"user_id": "carol", "limit": 5}]


async def test_get_financial_comparison_forwards_authenticated_user(
    app_and_service: tuple[FastAPI, _StubFinancialJobService],
) -> None:
    app, service = app_and_service

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/v1/finance/fin-123/comparison",
            headers={"Authorization": "Bearer dev-dana"},
        )

    assert response.status_code == 200
    assert response.json()["job_id"] == "fin-123"
    assert service.get_calls == [{"job_id": "fin-123", "user_id": "dana"}]
    assert service.comparison_requests == 1
