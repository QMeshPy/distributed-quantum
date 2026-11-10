"""Opt-in Calibration storage, funding, verification and task recovery endpoints."""

from __future__ import annotations

import base64
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field

from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.application.filecoin_service import FilecoinService
from quantum_backend_v2.artifacts.filecoin import MAX_BYTES, FilecoinReceipt


class WriteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    agent_id: str = Field(min_length=1, max_length=128)
    operation_id: str = Field(min_length=8, max_length=128, pattern=r"^[a-zA-Z0-9_-]+$")


class UploadRequest(WriteRequest):
    publish_publicly: Literal[True]
    data_base64: str = Field(min_length=1, max_length=MAX_BYTES * 4 // 3 + 4)


class ExportRequest(WriteRequest):
    publish_publicly: Literal[True]


class PaymentRequest(WriteRequest):
    action: Literal["deposit", "withdraw", "approve", "revoke", "terminate"]
    amount_usdfc: Decimal | None = Field(default=None, gt=0, le=10)
    data_set_id: str | None = Field(default=None, pattern=r"^[0-9]+$")


class TaskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    agent_id: str = Field(min_length=1, max_length=128)
    dataset: FilecoinReceipt
    publish_publicly: Literal[True]


def build_filecoin_router(*, service: FilecoinService) -> APIRouter:
    router = APIRouter(prefix="/api/v1/filecoin", tags=["filecoin"])

    async def call(awaitable):
        try:
            return await awaitable
        except LookupError:
            raise HTTPException(404, "Resource not found") from None
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from None
        except (OSError, TimeoutError):
            raise HTTPException(
                503, "Filecoin unavailable; reconcile the operation before retrying writes"
            ) from None

    @router.get("/accounts")
    async def accounts(current_user: CurrentUser):
        return {"accounts": await call(service.accounts(current_user.user_id))}

    @router.get("/artifacts")
    async def history(current_user: CurrentUser):
        return {"artifacts": await call(service.artifacts(current_user.user_id))}

    @router.post("/artifacts", response_model=FilecoinReceipt)
    async def upload(request: UploadRequest, current_user: CurrentUser):
        try:
            data = base64.b64decode(request.data_base64, validate=True)
        except ValueError:
            raise HTTPException(422, "Invalid base64") from None
        return await call(
            service.upload(
                agent_id=request.agent_id,
                owner_id=current_user.user_id,
                operation_id=request.operation_id,
                data=data,
            )
        )

    @router.post("/runs/{run_id}/archive", response_model=FilecoinReceipt)
    async def archive(run_id: str, request: ExportRequest, current_user: CurrentUser):
        return await call(
            service.export(
                agent_id=request.agent_id,
                owner_id=current_user.user_id,
                operation_id=request.operation_id,
                run_id=run_id,
            )
        )

    @router.post("/retrieve")
    async def retrieve(receipt: FilecoinReceipt, current_user: CurrentUser):
        data = await call(service.reader.download(receipt))
        return Response(
            data,
            media_type="application/octet-stream",
            headers={"Cache-Control": "private, no-store"},
        )

    @router.post("/status")
    async def storage_status(receipt: FilecoinReceipt, current_user: CurrentUser):
        return await call(service.reader.status(receipt))

    @router.post("/verify")
    async def verify(receipt: FilecoinReceipt, current_user: CurrentUser):
        return await call(service.verify(receipt))

    @router.get("/agents/{agent_id}/balance")
    async def balance(agent_id: str, current_user: CurrentUser):
        return await call(
            service.payment(
                agent_id=agent_id,
                owner_id=current_user.user_id,
                operation_id=None,
                action="balance",
            )
        )

    @router.post("/payments")
    async def payment(request: PaymentRequest, current_user: CurrentUser):
        return await call(service.payment(owner_id=current_user.user_id, **request.model_dump()))

    @router.get("/agents/{agent_id}/operations/{operation_id}")
    async def operation(agent_id: str, operation_id: str, current_user: CurrentUser):
        from quantum_backend_v2.provenance.hashing import hash_json

        await call(service.account(agent_id, current_user.user_id))
        row = await service.operations.collection.find_one(
            {"_id": hash_json([current_user.user_id, agent_id, operation_id])}
        )
        if row is None:
            raise HTTPException(404, "Operation not found")
        row.pop("_id", None)
        return row

    @router.post("/tasks/{run_id}/run", status_code=202)
    async def tasks(
        run_id: str,
        request: TaskRequest,
        current_user: CurrentUser,
        background_tasks: BackgroundTasks,
    ):
        if not 1 <= len(run_id) <= 128:
            raise HTTPException(422, "Run ID must contain 1 to 128 characters")
        key = await call(
            service.prepare_tasks(
                run_id=run_id,
                owner_id=current_user.user_id,
                agent_id=request.agent_id,
                dataset=request.dataset,
            )
        )
        background_tasks.add_task(service.execute_tasks, key)
        return {"run_id": run_id, "state": "running"}

    @router.get("/tasks/{run_id}")
    async def task_status(run_id: str, current_user: CurrentUser):
        row = await service.task(run_id, current_user.user_id)
        if row is None:
            raise HTTPException(404, "Task run not found")
        return row

    return router
