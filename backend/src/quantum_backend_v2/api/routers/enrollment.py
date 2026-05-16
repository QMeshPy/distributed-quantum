"""Peer enrollment router — enroll, list, approve, and quarantine peers."""

from __future__ import annotations

from fastapi import APIRouter, Query, status

from quantum_backend_v2.api.deps.auth import AdminUser, CurrentUser
from quantum_backend_v2.api.deps.pagination import PageParams, PagedResponse
from quantum_backend_v2.api.errors.models import not_found
from quantum_backend_v2.api.models.enrollment import (
    ApprovalAction,
    EnrollPeerRequest,
    EnrollmentActionRequest,
    EnrollmentListResponse,
    EnrollmentResponse,
)
from quantum_backend_v2.application.enrollment import approve_peer, enroll_peer
from quantum_backend_v2.identity.models import PeerTrustTier
from quantum_backend_v2.persistence.mongodb import PeerEnrollmentDocument


def build_enrollment_router() -> APIRouter:
    """Build the enrollment router."""
    router = APIRouter(prefix="/api/v1/enrollment", tags=["enrollment"])

    @router.post(
        "/peers",
        response_model=EnrollmentResponse,
        status_code=status.HTTP_201_CREATED,
        summary="Enroll or update a peer",
    )
    async def enroll(
        body: EnrollPeerRequest,
        current_user: CurrentUser,
    ) -> EnrollmentResponse:
        _guard_trust_tier(body.trust_tier, current_user)
        record = await enroll_peer(
            peer_id=body.peer_id,
            owner_user_id=current_user.user_id,
            actor_user_id=current_user.user_id,
            actor_can_manage_foreign=current_user.is_admin(),
            trust_tier=body.trust_tier,
            capability_summary=body.capability_summary,
        )
        return _to_response(record)

    @router.get(
        "/peers",
        response_model=EnrollmentListResponse,
        summary="List peer enrollments",
    )
    async def list_enrollments(
        current_user: CurrentUser,
        pagination: PageParams,
        trust_tier: str | None = Query(default=None),
        status_filter: str | None = Query(default=None, alias="status"),
    ) -> EnrollmentListResponse:
        query = PeerEnrollmentDocument.find()
        if trust_tier:
            query = query.find(PeerEnrollmentDocument.trust_tier == trust_tier)
        if status_filter:
            query = query.find(PeerEnrollmentDocument.enrollment_status == status_filter)
        if not current_user.is_admin():
            query = query.find(PeerEnrollmentDocument.owner_user_id == current_user.user_id)

        total = await query.count()
        records = await query.skip(pagination.offset).limit(pagination.limit).to_list()

        return EnrollmentListResponse(
            enrollments=[_to_response(r) for r in records],
            total=total,
        )

    @router.get(
        "/peers/{peer_id}",
        response_model=EnrollmentResponse,
        summary="Get a single peer enrollment",
    )
    async def get_enrollment(
        peer_id: str,
        current_user: CurrentUser,
    ) -> EnrollmentResponse:
        record = await PeerEnrollmentDocument.find_one(
            PeerEnrollmentDocument.peer_id == peer_id
        )
        if record is None:
            raise not_found("Peer enrollment", peer_id)
        if not current_user.is_admin() and record.owner_user_id != current_user.user_id:
            raise not_found("Peer enrollment", peer_id)
        return _to_response(record)

    @router.post(
        "/peers/{peer_id}/action",
        response_model=EnrollmentResponse,
        summary="Admin: approve, reject, or quarantine a peer",
    )
    async def enrollment_action(
        peer_id: str,
        body: EnrollmentActionRequest,
        _admin: AdminUser,
    ) -> EnrollmentResponse:
        if body.action == ApprovalAction.APPROVE:
            record = await approve_peer(peer_id=peer_id)
        else:
            record = await PeerEnrollmentDocument.find_one(
                PeerEnrollmentDocument.peer_id == peer_id
            )
            if record is not None:
                from datetime import datetime, timezone
                new_status = (
                    "quarantined"
                    if body.action == ApprovalAction.QUARANTINE
                    else "rejected"
                )
                record.enrollment_status = new_status
                record.updated_at = datetime.now(timezone.utc)
                await record.save()

        if record is None:
            raise not_found("Peer enrollment", peer_id)

        return _to_response(record)

    return router


def _to_response(record: PeerEnrollmentDocument) -> EnrollmentResponse:
    return EnrollmentResponse(
        id=record.id,
        peer_id=record.peer_id,
        owner_user_id=record.owner_user_id,
        trust_tier=record.trust_tier,
        enrollment_status=record.enrollment_status,
        capability_summary=record.capability_summary,
        published_service_count=record.published_service_count,
        last_seen_at=record.last_seen_at,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _guard_trust_tier(
    requested: PeerTrustTier,
    current_user: object,
) -> None:
    from quantum_backend_v2.api.errors.models import forbidden
    from quantum_backend_v2.identity.models import UserRole

    privileged_tiers = {PeerTrustTier.PLATFORM_MANAGED, PeerTrustTier.ORG_MANAGED}
    if requested in privileged_tiers:
        user = current_user  # type: ignore[assignment]
        if not (user.has_role(UserRole.ADMIN) or user.has_role(UserRole.OPERATOR)):  # type: ignore[attr-defined]
            raise forbidden(
                f"Trust tier '{requested.value}' requires ADMIN or OPERATOR role."
            )
