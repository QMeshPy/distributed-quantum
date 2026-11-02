import asyncio
import os
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from beanie import init_beanie
from fastapi import FastAPI
from pymongo import AsyncMongoClient

from quantum_backend_v2.api.routers.circuits import build_circuits_router
from quantum_backend_v2.api.routers.x402 import build_x402_router
from quantum_backend_v2.application.parity import CircuitJobService
from quantum_backend_v2.application.x402_dispatch import recover_paid_jobs
from quantum_backend_v2.payments.ledger import LedgerService
from quantum_backend_v2.payments.models import PaymentEventStatus, PaymentPurpose, PaymentRail
from quantum_backend_v2.persistence.mongodb import PlatformUserDocument, WorkflowRunDocument


@pytest.mark.anyio
@pytest.mark.skipif(
    not os.getenv("X402_TEST_MONGO_URI"), reason="Requires a disposable MongoDB database"
)
async def test_payment_records_and_activation_use_durable_storage():
    client = AsyncMongoClient(os.environ["X402_TEST_MONGO_URI"])
    database = client[f"qmesh_x402_test_{uuid4().hex}"]
    try:
        await init_beanie(
            database=database, document_models=[PlatformUserDocument, WorkflowRunDocument]
        )
        ledger = LedgerService(database)
        await ledger.ensure_indexes()
        jobs = CircuitJobService.__new__(CircuitJobService)
        jobs.process = AsyncMock()
        app = FastAPI()
        secret = "test-gateway-secret"
        app.include_router(build_circuits_router(job_service=jobs, x402_gateway_secret=secret))
        app.include_router(
            build_x402_router(gateway_secret=secret, ledger=ledger, job_service=jobs)
        )
        payment_id = "a" * 64
        job_id = f"job-x402-{payment_id}"
        payment = {
            "payment_id": payment_id,
            "network": "eip155:84532",
            "amount": "0.025000",
            "asset": "usdc-token",
            "payer": "payer",
            "receiver": "receiver",
            "job_id": job_id,
            "status": "pending",
        }
        headers = {"X-X402-Gateway-Secret": secret}
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as http:
            pending = await http.post(
                "/api/v1/internal/x402/payments", json=payment, headers=headers
            )
            assert pending.status_code == 200, pending.text
            circuit = {"circuit": "OPENQASM 2.0; qreg q[1];"}
            submit = await http.post(
                "/api/v1/internal/x402/circuits/submit",
                json=circuit,
                headers={**headers, "X-X402-Payment-Id": payment_id},
            )
            assert submit.status_code == 201, submit.text
            assert submit.json()["status"] == "PAYMENT_PENDING"
            jobs.process.assert_not_awaited()
            confirmed = {**payment, "status": "confirmed", "transaction": "test-transaction"}
            for _ in range(2):
                result = await http.post(
                    "/api/v1/internal/x402/payments", json=confirmed, headers=headers
                )
                assert result.status_code == 200, result.text
            jobs.process.assert_awaited_once_with(job_id)
            assert await database.workflow_runs.count_documents({}) == 1
            assert await database.payment_events.count_documents({}) == 1
            event = await ledger.get_event(f"x402:{payment_id}")
            assert event.external_ref == "test-transaction"
            assert event.chain_id == "eip155:84532"
            assert event.job_id == job_id
            assert str(event.amount) == "0.025000"
    finally:
        try:
            await client.drop_database(database.name)
        finally:
            await client.close()


@pytest.mark.anyio
@pytest.mark.skipif(
    not os.getenv("X402_TEST_MONGO_URI"), reason="Requires a disposable MongoDB database"
)
async def test_recovery_dispatches_confirmed_jobs_once_and_never_replays_started_work():
    client = AsyncMongoClient(os.environ["X402_TEST_MONGO_URI"])
    database = client[f"qmesh_x402_test_{uuid4().hex}"]
    try:
        await init_beanie(
            database=database, document_models=[PlatformUserDocument, WorkflowRunDocument]
        )
        ledger = LedgerService(database)
        await ledger.ensure_indexes()
        jobs = CircuitJobService.__new__(CircuitJobService)
        jobs._quantum_bridge = SimpleNamespace(
            wait_for_service_peers=AsyncMock(side_effect=RuntimeError("stop after dispatch"))
        )
        for marker, status, confirmed in [
            ("a", "PAYMENT_PENDING", True),
            ("b", "QUEUED", True),
            ("c", "PAYMENT_PENDING", False),
            ("d", "COMPILING", True),
            ("e", "PAYMENT_PENDING", True),
        ]:
            payment_id = marker * 64
            job_id = f"job-x402-{payment_id}"
            job = await jobs.submit(
                circuit_text="OPENQASM 2.0; qreg q[1];",
                owner_user_id="x402-test",
                job_id=job_id,
                awaiting_payment=True,
            )
            job.status = status
            await job.save()
            await ledger.record_event(
                idempotency_key=f"x402:{payment_id}",
                rail=PaymentRail.X402,
                purpose=PaymentPurpose.JOB,
                amount=Decimal("0.01"),
                job_id=job_id if marker != "e" else "another-job",
            )
            if confirmed:
                await ledger.confirm(f"x402:{payment_id}", external_ref=f"tx-{marker}")

        await jobs.process("job-x402-" + "c" * 64)
        jobs._quantum_bridge.wait_for_service_peers.assert_not_awaited()
        await asyncio.gather(recover_paid_jobs(jobs, ledger), recover_paid_jobs(jobs, ledger))
        assert jobs._quantum_bridge.wait_for_service_peers.await_count == 2
        for marker, expected in [
            ("a", "FAILED"),
            ("b", "FAILED"),
            ("c", "PAYMENT_PENDING"),
            ("d", "COMPILING"),
            ("e", "PAYMENT_PENDING"),
        ]:
            assert (await WorkflowRunDocument.get("job-x402-" + marker * 64)).status == expected
        await recover_paid_jobs(jobs, ledger)
        assert jobs._quantum_bridge.wait_for_service_peers.await_count == 2
        unresolved_key = "x402:" + "c" * 64
        await ledger.mark_uncertain(unresolved_key, reason="Lost settlement reply")
        await recover_paid_jobs(jobs, ledger)
        assert jobs._quantum_bridge.wait_for_service_peers.await_count == 2
        await ledger.reconcile(
            unresolved_key,
            outcome=PaymentEventStatus.CONFIRMED,
            actor="test-admin",
            reason="Verified settlement independently",
            external_ref="reconciled-transaction",
        )
        await recover_paid_jobs(jobs, ledger)
        await recover_paid_jobs(jobs, ledger)
        assert jobs._quantum_bridge.wait_for_service_peers.await_count == 3
    finally:
        try:
            await client.drop_database(database.name)
        finally:
            await client.close()
