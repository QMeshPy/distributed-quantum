from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.infra.persistence import FragmentExecutionEvent, SQLiteRuntimeEventStore
from quantum_coordinator.reservation import ReservationRecord, ReservationState


def test_runtime_store_persists_reservation_and_events(tmp_path: Path) -> None:
    store = SQLiteRuntimeEventStore(str(tmp_path / "runtime.db"))

    reservation = ReservationRecord(
        reservation_id="rsv-1",
        job_id="job-1",
        fragment_id="frag-1",
        node_id="node-1",
        service_type=GateType.CNOT,
        min_fidelity=0.9,
        window_start=datetime.now(timezone.utc),
        window_end=datetime.now(timezone.utc) + timedelta(seconds=1),
        state=ReservationState.COMMITTED,
        reason=None,
        updated_at=datetime.now(timezone.utc),
    )
    store.upsert_reservation(reservation)

    store.append_fragment_event(
        FragmentExecutionEvent(
            event_id="evt-1",
            job_id="job-1",
            fragment_id="frag-1",
            node_id="node-1",
            attempt=1,
            status="SUCCESS",
            error=None,
            observed_fidelity=0.95,
            created_at=datetime.now(timezone.utc),
        )
    )

    loaded = store.get_reservation("rsv-1")
    assert loaded is not None
    assert loaded.state == ReservationState.COMMITTED

    events = store.list_fragment_events("job-1")
    assert len(events) == 1
    assert events[0].status == "SUCCESS"
