"""Recover confirmed x402 jobs that missed their background-task dispatch."""

import asyncio
import logging

from quantum_backend_v2.application.parity import CircuitJobService
from quantum_backend_v2.payments.ledger import LedgerService
from quantum_backend_v2.payments.models import PaymentEventStatus, PaymentPurpose, PaymentRail
from quantum_backend_v2.persistence.mongodb import WorkflowRunDocument

logger = logging.getLogger(__name__)


async def recover_paid_jobs(jobs: CircuitJobService, ledger: LedgerService) -> None:
    candidates = WorkflowRunDocument.find(
        {
            "_id": {"$regex": "^job-x402-[a-f0-9]{64}$"},
            "status": {"$in": ["PAYMENT_PENDING", "QUEUED"]},
        }
    )
    async for job in candidates:
        try:
            event = await ledger.get_event("x402:" + job.id.removeprefix("job-x402-"))
            if (
                event is None
                or event.status is not PaymentEventStatus.CONFIRMED
                or event.rail is not PaymentRail.X402
                or event.purpose is not PaymentPurpose.JOB
                or event.job_id != job.id
            ):
                continue
            await jobs.activate_paid_job(job.id)
            await jobs.process(job.id)
        except Exception as exc:
            logger.warning("x402 job %s recovery failed: %s", job.id, type(exc).__name__)


async def dispatch_paid_jobs(jobs: CircuitJobService, ledger: LedgerService) -> None:
    while True:
        try:
            await recover_paid_jobs(jobs, ledger)
        except Exception as exc:
            logger.warning("x402 dispatch recovery failed: %s", type(exc).__name__)
        await asyncio.sleep(5)
