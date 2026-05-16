"""Peer enrollment use-case — validates, persists, and emits enrollment events."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from quantum_backend_v2.api.errors.models import forbidden
from quantum_backend_v2.identity.models import PeerTrustTier
from quantum_backend_v2.persistence.mongodb import PeerEnrollmentDocument

logger = logging.getLogger(__name__)


class PeerEnrollmentStatus(str):
    ENROLLING = "enrolling"
    PENDING_APPROVAL = "pending_approval"
    READY = "ready"
    REJECTED = "rejected"


async def enroll_peer(
    *,
    peer_id: str,
    owner_user_id: str | None,
    actor_user_id: str,
    actor_can_manage_foreign: bool = False,
    trust_tier: PeerTrustTier,
    capability_summary: dict[str, object],
) -> PeerEnrollmentDocument:
    """Create or update a peer enrollment record.

    Idempotent — calling again for the same peer_id updates the record.
    """
    existing = await PeerEnrollmentDocument.find_one(
        PeerEnrollmentDocument.peer_id == peer_id
    )

    if existing is not None:
        if (
            existing.owner_user_id is not None
            and existing.owner_user_id != actor_user_id
            and not actor_can_manage_foreign
        ):
            raise forbidden(
                f"Peer '{peer_id}' is already owned by another user and cannot be updated."
            )
        existing.trust_tier = trust_tier.value
        if existing.owner_user_id is None:
            existing.owner_user_id = owner_user_id
        existing.capability_summary = capability_summary
        existing.last_seen_at = datetime.now(timezone.utc)
        existing.updated_at = datetime.now(timezone.utc)
        await existing.save()
        logger.info("updated enrollment for peer %s (tier=%s)", peer_id, trust_tier.value)
        return existing

    record = PeerEnrollmentDocument(
        id=uuid.uuid4().hex,
        peer_id=peer_id,
        owner_user_id=owner_user_id,
        trust_tier=trust_tier.value,
        enrollment_status=PeerEnrollmentStatus.PENDING_APPROVAL,
        capability_summary=capability_summary,
    )
    await record.insert()
    logger.info("enrolled new peer %s (tier=%s)", peer_id, trust_tier.value)
    return record


async def approve_peer(
    *,
    peer_id: str,
) -> PeerEnrollmentDocument | None:
    """Transition a pending peer to READY status."""
    record = await PeerEnrollmentDocument.find_one(
        PeerEnrollmentDocument.peer_id == peer_id
    )
    if record is None:
        return None

    record.enrollment_status = PeerEnrollmentStatus.READY
    record.updated_at = datetime.now(timezone.utc)
    await record.save()
    logger.info("approved peer %s", peer_id)
    return record
