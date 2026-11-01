"""Opt-in pharma job persistence on a local MongoDB."""

import asyncio
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from beanie import init_beanie
from pymongo import AsyncMongoClient

import quantum_backend_v2.api.routers.pharma as pharma_router
from quantum_backend_v2.application.pharma_jobs import INTERRUPTED_ERROR, PharmaJobService
from quantum_backend_v2.identity.models import UserRole, UserTokenClaims
from quantum_backend_v2.persistence.mongodb import PharmaJobDocument
from quantum_backend_v2.pharma.config import PharmaMode, PharmaWorkflowConfig

MONGODB_URI = os.environ.get("QMESH_TEST_MONGODB_URI")
pytestmark = pytest.mark.skipif(
    not MONGODB_URI, reason="set QMESH_TEST_MONGODB_URI for a local test server"
)


def user(user_id: str, *roles: UserRole) -> UserTokenClaims:
    now = datetime.now(timezone.utc)
    return UserTokenClaims(
        user_id=user_id,
        external_subject=f"test|{user_id}",
        email=f"{user_id}@example.com",
        roles=frozenset(roles),
        issued_at=now,
        expires_at=now + timedelta(hours=1),
    )


def run_with_database(test):
    async def run():
        database = "qmesh_pharma_test_" + uuid4().hex
        client = AsyncMongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        try:
            await init_beanie(database=client[database], document_models=[PharmaJobDocument])
            await test(client, database)
        finally:
            await client.drop_database(database)
            await client.close()

    asyncio.run(run())


def test_job_survives_a_restart_and_stays_with_its_owner():
    async def test(client, database):
        submitted = await PharmaJobService().submit(
            owner_user_id="x402-algorand", mode="discovery", target_pdb_id="1IEP"
        )

        # A new client and a fresh service stand in for the restarted process.
        restarted = AsyncMongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        try:
            await init_beanie(database=restarted[database], document_models=[PharmaJobDocument])
            found = await PharmaJobService().get_job_for_owner(
                submitted.id, owner_user_id="x402-algorand"
            )
            other = await PharmaJobService().get_job_for_owner(
                submitted.id, owner_user_id="mallory"
            )
        finally:
            await restarted.close()
        assert found is not None and found.status == "queued"
        assert found.target_pdb_id == "1IEP"
        assert other is None

    run_with_database(test)


def test_list_get_and_cancel_are_scoped_to_the_caller():
    async def test(client, database):
        jobs = PharmaJobService()
        alice, bob = user("alice"), user("bobby")
        admin = user("root-admin", UserRole.ADMIN)
        mine = await jobs.submit(owner_user_id="alice", mode="discovery", target_pdb_id="1IEP")
        await jobs.submit(owner_user_id="bobby", mode="discovery", target_pdb_id="6LU7")

        assert [job.id for job in await jobs.list_jobs(current_user=alice)] == [mine.id]
        assert await jobs.get_job(mine.id, current_user=bob) is None
        assert await jobs.get_job(mine.id, current_user=admin) is not None
        assert len(await jobs.list_jobs(current_user=admin)) == 2

        assert await jobs.cancel(mine.id, current_user=bob) is None
        assert (await PharmaJobDocument.get(mine.id)).status == "queued"
        cancelled = await jobs.cancel(mine.id, current_user=alice)
        assert cancelled is not None and cancelled.status == "cancelled"

    run_with_database(test)


def test_cancelled_job_is_not_overwritten_by_the_pipeline():
    async def test(client, database):
        jobs = PharmaJobService()
        job = await jobs.submit(owner_user_id="alice", mode="discovery", target_pdb_id="1IEP")
        assert await jobs.mark_running(job.id)
        await jobs.cancel(job.id, current_user=user("alice"))

        await jobs.complete(job.id, state="done", result={"candidates": []}, log_lines=[])

        stored = await PharmaJobDocument.get(job.id)
        assert stored.status == "cancelled"
        assert stored.result_payload is None
        assert not await jobs.mark_running(job.id)

    run_with_database(test)


def test_completed_job_keeps_result_and_log_lines():
    async def test(client, database):
        jobs = PharmaJobService()
        job = await jobs.submit(owner_user_id="alice", mode="discovery", target_pdb_id="1IEP")
        await jobs.mark_running(job.id)
        lines = [{"level": "info", "message": "started"}]

        await jobs.complete(job.id, state="done", result={"candidates": [1]}, log_lines=lines)

        stored = await PharmaJobDocument.get(job.id)
        assert stored.status == "completed"
        assert stored.result_payload == {"candidates": [1]}
        assert stored.log_lines == lines
        assert stored.completed_at is not None

    run_with_database(test)


def test_recovery_fails_jobs_a_previous_process_left_active():
    async def test(client, database):
        jobs = PharmaJobService()
        queued = await jobs.submit(owner_user_id="alice", mode="discovery", target_pdb_id="1IEP")
        running = await jobs.submit(owner_user_id="alice", mode="discovery", target_pdb_id="6LU7")
        await jobs.mark_running(running.id)
        done = await jobs.submit(owner_user_id="alice", mode="discovery", target_pdb_id="3HTB")
        await jobs.mark_running(done.id)
        await jobs.complete(done.id, state="done", result={}, log_lines=[])

        assert await jobs.recover_interrupted() == 2

        for job_id in (queued.id, running.id):
            stored = await PharmaJobDocument.get(job_id)
            assert stored.status == "failed"
            assert stored.error == INTERRUPTED_ERROR
        assert (await PharmaJobDocument.get(done.id)).status == "completed"

    run_with_database(test)


CONFIG = PharmaWorkflowConfig(mode=PharmaMode.DISCOVERY, target_pdb_id="1IEP")


def test_runner_persists_the_pipeline_result_from_the_main_loop(monkeypatch):
    def pipeline(job_id, config, log_lines):
        log_lines.append({"level": "info", "message": "ran"})
        return "done", {"candidates": [1, 2]}

    monkeypatch.setattr(pharma_router, "_run_pipeline", pipeline)

    async def test(client, database):
        jobs = PharmaJobService()
        job = await jobs.submit(owner_user_id="alice", mode="discovery", target_pdb_id="1IEP")

        await pharma_router._run_pharma_job(jobs, job.id, CONFIG)

        stored = await PharmaJobDocument.get(job.id)
        assert stored.status == "completed"
        assert stored.result_payload == {"candidates": [1, 2]}
        assert stored.log_lines == [{"level": "info", "message": "ran"}]
        assert job.id not in pharma_router._RUNNING_LOGS

    run_with_database(test)


def test_runner_records_a_pipeline_failure(monkeypatch):
    def pipeline(job_id, config, log_lines):
        raise RuntimeError("docking engine crashed")

    monkeypatch.setattr(pharma_router, "_run_pipeline", pipeline)

    async def test(client, database):
        jobs = PharmaJobService()
        job = await jobs.submit(owner_user_id="alice", mode="discovery", target_pdb_id="1IEP")

        await pharma_router._run_pharma_job(jobs, job.id, CONFIG)

        stored = await PharmaJobDocument.get(job.id)
        assert stored.status == "failed"
        assert stored.error == "docking engine crashed"

    run_with_database(test)


def test_runner_skips_a_job_cancelled_before_it_started(monkeypatch):
    calls = []
    monkeypatch.setattr(pharma_router, "_run_pipeline", lambda *args: calls.append(args))

    async def test(client, database):
        jobs = PharmaJobService()
        job = await jobs.submit(owner_user_id="alice", mode="discovery", target_pdb_id="1IEP")
        await jobs.cancel(job.id, current_user=user("alice"))

        await pharma_router._run_pharma_job(jobs, job.id, CONFIG)

        assert calls == []
        assert (await PharmaJobDocument.get(job.id)).status == "cancelled"

    run_with_database(test)
