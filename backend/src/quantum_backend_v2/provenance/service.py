"""Authorized verification orchestration with an injectable persistence boundary."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Protocol

from pydantic import ValidationError

from quantum_backend_v2.provenance.models import ProvenanceBundle
from quantum_backend_v2.provenance.verification import (
    AnchorAdapter,
    RunEvidence,
    StorageAdapter,
    VerificationCheck,
    VerificationReport,
    make_report,
    verify_bundle,
)


@dataclass(frozen=True)
class StoredProvenance:
    """Stored commitment kept outside the bundle to avoid a self-referential hash."""

    bundle_id: str
    workflow_run_id: str
    payload: dict[str, Any]
    content_hash: str | None


class ProvenanceRepository(Protocol):
    """Load stored evidence and the independently owned run it references."""

    async def get_bundle(self, bundle_id: str) -> StoredProvenance | None: ...

    async def get_run(self, run_id: str) -> RunEvidence | None: ...


class ProvenanceService:
    """Never authorize from mutable bundle payload ownership fields."""

    def __init__(
        self,
        repository: ProvenanceRepository,
        *,
        storage_adapters: Mapping[str, StorageAdapter] | None = None,
        anchor_adapters: Mapping[str, AnchorAdapter] | None = None,
    ) -> None:
        self._repository = repository
        self._storage_adapters = storage_adapters
        self._anchor_adapters = anchor_adapters

    async def verify(
        self, bundle_id: str, *, user_id: str, is_admin: bool
    ) -> VerificationReport | None:
        """Return no record for missing or inaccessible evidence (avoid ID enumeration)."""
        stored = await self._repository.get_bundle(bundle_id)
        if stored is None:
            return None
        run = await self._repository.get_run(stored.workflow_run_id)
        if run is None or (run.owner_user_id != user_id and not is_admin):
            return None
        try:
            bundle = ProvenanceBundle.model_validate(stored.payload)
        except ValidationError:
            return make_report(
                bundle_id,
                [
                    VerificationCheck(
                        kind="hash",
                        name="schema",
                        status="failed",
                        message="Stored bundle does not match the provenance schema",
                    )
                ],
            )
        if bundle.bundle_id != bundle_id:
            return make_report(
                bundle_id,
                [
                    VerificationCheck(
                        kind="hash",
                        name="bundle_identity",
                        status="failed",
                        message="Stored bundle identifier does not match the requested record",
                    )
                ],
            )
        return await verify_bundle(
            bundle,
            expected_hash=stored.content_hash,
            run=run,
            storage_adapters=self._storage_adapters,
            anchor_adapters=self._anchor_adapters,
        )
