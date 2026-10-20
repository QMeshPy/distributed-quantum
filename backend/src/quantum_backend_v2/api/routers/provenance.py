"""Authenticated provenance verification endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Response

from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.api.errors.models import not_found
from quantum_backend_v2.provenance.service import ProvenanceService
from quantum_backend_v2.provenance.verification import VerificationReport


def build_provenance_router(*, service: ProvenanceService) -> APIRouter:
    """Build the verifier without binding it to a particular database or chain."""
    router = APIRouter(prefix="/api/v1/provenance", tags=["provenance"])

    @router.get("/{bundle_id}/verify", response_model=VerificationReport)
    async def verify(
        bundle_id: str, current_user: CurrentUser, response: Response
    ) -> VerificationReport:
        report = await service.verify(
            bundle_id, user_id=current_user.user_id, is_admin=current_user.is_admin()
        )
        if report is None:
            raise not_found("Provenance bundle", bundle_id)
        # Results are user-scoped and external confirmations can change over time.
        response.headers["Cache-Control"] = "private, no-store"
        return report

    return router
