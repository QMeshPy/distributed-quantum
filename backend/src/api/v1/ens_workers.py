"""Proof-of-concept worker ENS record stub (issue #22 phase 2).

Returns the documented text-record schema for a demo worker. Replace with a
CCIP-Read / Mongo-backed issuer when a parent name is registered.
"""

from __future__ import annotations

from fastapi import APIRouter, status
from pydantic import BaseModel, ConfigDict, Field

from quantum_backend_v2.api.errors.models import ErrorCode, PlatformException

router = APIRouter(prefix="/api/v1/ens/workers", tags=["ens"])

# Demo PoC record — not on-chain; validates the schema against the UI/API.
_POC_WORKERS: dict[str, dict[str, object]] = {
    "worker-alpha": {
        "subname": "worker-alpha",
        "parent": "qmesh.eth",
        "fqdn": "worker-alpha.qmesh.eth",
        "peer_id": "12D3KooWDemoPeerIdReplaceWithEnrollment",
        "multiaddrs": [
            "/ip4/127.0.0.1/tcp/4021",
            "/dns4/example.invalid/tcp/443/wss",
        ],
        "services": ["circuit.execute", "finance.qaoa"],
        "pricing_url": "https://example.invalid/pricing",
        "network": "base-sepolia",
        "wallet": "0x1111111111111111111111111111111111111111",
        "text_records": {
            "peer-id": "12D3KooWDemoPeerIdReplaceWithEnrollment",
            "multiaddrs": "/ip4/127.0.0.1/tcp/4021,/dns4/example.invalid/tcp/443/wss",
            "services": "circuit.execute,finance.qaoa",
            "pricing-url": "https://example.invalid/pricing",
            "network": "base-sepolia",
            "wallet": "0x1111111111111111111111111111111111111111",
        },
        "on_chain": False,
        "note": "PoC stub only — see documentations/repository/backend/docs/ens-worker-subnames.md",
    }
}


class WorkerEnsRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subname: str
    parent: str
    fqdn: str
    peer_id: str
    multiaddrs: list[str]
    services: list[str]
    pricing_url: str | None = None
    network: str | None = None
    wallet: str | None = None
    text_records: dict[str, str] = Field(default_factory=dict)
    on_chain: bool = False
    note: str | None = None


@router.get(
    "",
    response_model=list[WorkerEnsRecord],
    summary="List PoC worker ENS records",
)
async def list_worker_ens_records() -> list[WorkerEnsRecord]:
    return [WorkerEnsRecord.model_validate(v) for v in _POC_WORKERS.values()]


@router.get(
    "/{subname}",
    response_model=WorkerEnsRecord,
    summary="Get a PoC worker ENS record by subname",
)
async def get_worker_ens_record(subname: str) -> WorkerEnsRecord:
    key = subname.strip().lower()
    record = _POC_WORKERS.get(key)
    if record is None:
        raise PlatformException(
            status_code=status.HTTP_404_NOT_FOUND,
            error=ErrorCode.NOT_FOUND,
            message=f"No PoC worker ENS record for {subname!r}",
        )
    return WorkerEnsRecord.model_validate(record)
