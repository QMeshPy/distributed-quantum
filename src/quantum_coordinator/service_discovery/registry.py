"""In-memory service registry with TTL-based staleness handling."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.infra.persistence.service_registry_store import ServiceRegistryStore
from quantum_coordinator.service_discovery.advertisement import ServiceAdvertisement


@dataclass(frozen=True)
class RegistryEntry:
    """Single service entry tracked by the registry."""

    advertisement: ServiceAdvertisement
    received_at: datetime


class ServiceRegistry:
    """Maintains available service advertisements with staleness tracking."""

    def __init__(
        self,
        stale_after: timedelta,
        store: ServiceRegistryStore | None = None,
    ) -> None:
        self._stale_after = stale_after
        self._store = store
        self._entries: dict[tuple[str, GateType], RegistryEntry] = {}

        if self._store is not None:
            self.load_from_store()

    def upsert(
        self,
        advertisement: ServiceAdvertisement,
        received_at: datetime | None = None,
    ) -> None:
        """Insert or update a service advertisement."""
        key = (advertisement.node_id, advertisement.service_type)
        entry = RegistryEntry(
            advertisement=advertisement,
            received_at=received_at or datetime.now(timezone.utc),
        )
        self._entries[key] = entry

        if self._store is not None:
            self._store.save(advertisement)

    def load_from_store(self) -> None:
        """Load snapshot from storage into local memory."""
        if self._store is None:
            return
        for advertisement in self._store.load_all():
            self.upsert(advertisement)

    def prune_stale(self, now: datetime | None = None) -> list[ServiceAdvertisement]:
        """Mark stale entries as unavailable and return updated advertisements."""
        current = now or datetime.now(timezone.utc)
        updated: list[ServiceAdvertisement] = []

        for key, entry in list(self._entries.items()):
            age = current - entry.advertisement.updated_at
            if age <= self._stale_after:
                continue
            if not entry.advertisement.availability:
                continue

            stale_ad = entry.advertisement.model_copy(update={"availability": False})
            self._entries[key] = RegistryEntry(
                advertisement=stale_ad,
                received_at=entry.received_at,
            )
            updated.append(stale_ad)

            if self._store is not None:
                self._store.save(stale_ad)

        return updated

    def query(
        self,
        service_type: GateType | None = None,
        min_fidelity: float = 0.0,
        available_only: bool = True,
    ) -> list[ServiceAdvertisement]:
        """Query advertisements with optional filtering."""
        results: list[ServiceAdvertisement] = []
        for entry in self._entries.values():
            ad = entry.advertisement
            if service_type is not None and ad.service_type != service_type:
                continue
            if ad.fidelity < min_fidelity:
                continue
            if available_only and not ad.availability:
                continue
            results.append(ad)

        return sorted(results, key=lambda ad: (ad.node_id, ad.service_type.value))

    def all_entries(self) -> list[RegistryEntry]:
        """Return all registry entries for diagnostics."""
        return list(self._entries.values())

    def count(self) -> int:
        """Return total number of tracked entries."""
        return len(self._entries)
