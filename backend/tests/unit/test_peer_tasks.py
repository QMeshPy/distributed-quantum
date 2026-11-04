"""PeerTaskDispatcher: spreading, ordering, rerouting and local fallback, with fake peers."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from quantum_backend_v2.application.peer_tasks import LOCAL, PeerTaskDispatcher
from quantum_backend_v2.protocols.compute import ComputeTaskRequest, ComputeTaskResponse

pytestmark = pytest.mark.anyio

COORDINATOR = "coordinator"


class FakeNetwork:
    """Stands in for DiscoveryService: a registry plus request_peer_rpc over scripted peers."""

    def __init__(self, peer_ids, *, dead=(), refusing=(), delay=0.0):
        self.peers = {
            peer_id: SimpleNamespace(
                peer_id=peer_id,
                health_status="healthy",
                network_addresses=(),
                label=f"lbl-{peer_id}",
            )
            for peer_id in [COORDINATOR, *peer_ids]
        }
        self.registry = SimpleNamespace(
            list_peers=lambda include_stale=False: list(self.peers.values()),
            get_peer=lambda peer_id: self.peers.get(peer_id),
        )
        self.dead, self.refusing, self.delay = set(dead), set(refusing), delay
        self.delay_of: dict[str, float] = {}  # per-peer override of `delay`
        self.calls: list[tuple[str, int]] = []  # (peer, task number)
        self.in_flight: dict[str, int] = {}
        self.max_in_flight = 0

    async def request_peer_rpc(
        self, *, peer_id, protocol_id, payload, peer_addresses, timeout_seconds
    ):
        request = ComputeTaskRequest.model_validate_json(payload)
        self.calls.append((peer_id, request.input["n"]))
        self.in_flight[peer_id] = self.in_flight.get(peer_id, 0) + 1
        self.max_in_flight = max(self.max_in_flight, *self.in_flight.values())
        try:
            await asyncio.sleep(self.delay_of.get(peer_id, self.delay))
            if peer_id in self.dead:
                raise ConnectionError("peer unreachable")
            if peer_id in self.refusing:
                response = ComputeTaskResponse(
                    task_id=request.task_id,
                    executing_peer_id=peer_id,
                    ok=False,
                    error="no pennylane",
                )
            else:
                response = ComputeTaskResponse(
                    task_id=request.task_id,
                    executing_peer_id=peer_id,
                    ok=True,
                    output={"n": request.input["n"], "by": peer_id},
                )
            return response.model_dump_json().encode()
        finally:
            self.in_flight[peer_id] -= 1


def dispatcher(network):
    return PeerTaskDispatcher(
        discovery_service=network, protocol_id="/t", local_peer_id=COORDINATOR, timeout_seconds=5
    )


def local(task_input):
    return {"n": task_input["n"], "by": LOCAL}


def inputs(count):
    return [{"n": n} for n in range(count)]


async def test_no_peers_runs_everything_locally_in_order():
    outcomes = await dispatcher(FakeNetwork([])).run("test.task", inputs(5), run_locally=local)
    assert [o.output["n"] for o in outcomes] == [0, 1, 2, 3, 4]
    assert {o.executed_by for o in outcomes} == {LOCAL}


async def test_the_coordinator_itself_is_never_a_target():
    network = FakeNetwork(["a"])
    await dispatcher(network).run("test.task", inputs(4), run_locally=local)
    assert COORDINATOR not in {peer for peer, _ in network.calls}


@pytest.mark.parametrize("peer_count", [5, 15, 30])
async def test_one_task_per_peer_when_tasks_equal_peers(peer_count):
    network = FakeNetwork([f"p{i}" for i in range(peer_count)], delay=0.02)
    outcomes = await dispatcher(network).run("test.task", inputs(peer_count), run_locally=local)
    assert [o.output["n"] for o in outcomes] == list(range(peer_count))
    assert {o.executed_by for o in outcomes} == {f"p{i}" for i in range(peer_count)}
    assert all(o.attempts == 1 for o in outcomes)


async def test_a_peer_never_has_two_tasks_in_flight():
    network = FakeNetwork(["a", "b", "c"], delay=0.02)
    outcomes = await dispatcher(network).run("test.task", inputs(12), run_locally=local)
    assert network.max_in_flight == 1
    assert all(o.executed_by != LOCAL for o in outcomes)
    assert {o.executed_by for o in outcomes} == {"a", "b", "c"}


async def test_dead_peer_is_dropped_and_its_task_rerouted():
    network = FakeNetwork(["a", "dead", "c"], dead={"dead"}, delay=0.01)
    events: list[str] = []
    outcomes = await dispatcher(network).run(
        "test.task", inputs(6), run_locally=local, on_event=events.append
    )
    assert [o.output["n"] for o in outcomes] == list(range(6))
    assert "dead" not in {o.executed_by for o in outcomes}
    assert LOCAL not in {o.executed_by for o in outcomes}  # healthy peers took the rerouted task
    assert (
        sum(1 for peer, _ in network.calls if peer == "dead") == 1
    )  # not retried on the same peer
    assert any("dropped" in event for event in events)


async def test_peer_that_cannot_run_the_task_is_dropped_too():
    network = FakeNetwork(["a", "nolib"], refusing={"nolib"})
    outcomes = await dispatcher(network).run("test.task", inputs(4), run_locally=local)
    assert {o.executed_by for o in outcomes} == {"a"}
    assert sorted(o.output["n"] for o in outcomes) == [0, 1, 2, 3]


async def test_when_every_peer_fails_the_coordinator_finishes_the_job():
    network = FakeNetwork(["x", "y"], dead={"x", "y"})
    events: list[str] = []
    outcomes = await dispatcher(network).run(
        "test.task", inputs(3), run_locally=local, on_event=events.append
    )
    assert [o.output for o in outcomes] == [{"n": n, "by": LOCAL} for n in range(3)]
    assert any("ran on the coordinator" in event for event in events)


async def test_stale_or_unhealthy_peers_are_not_used():
    network = FakeNetwork(["ok", "sick"])
    network.peers["sick"].health_status = "degraded"
    outcomes = await dispatcher(network).run("test.task", inputs(4), run_locally=local)
    assert {o.executed_by for o in outcomes} == {"ok"}


async def test_label_of_prefers_the_label():
    network = FakeNetwork(["a"])
    assert dispatcher(network).label_of("a") == "lbl-a"
    assert dispatcher(network).label_of(LOCAL) == LOCAL


async def test_first_finisher_of_a_group_wins_and_a_slow_peer_is_not_waited_for():
    network = FakeNetwork(["fast1", "fast2", "slow"], delay=0.01)
    network.delay_of["slow"] = 30.0  # would take 30 s if anyone waited for it
    events: list[tuple[int, str]] = []
    started = asyncio.get_running_loop().time()
    outcomes = await dispatcher(network).run(
        "test.task",
        inputs(3),
        run_locally=local,
        groups=["x", "x", "x"],  # three interchangeable starts of one fragment
        on_task=lambda index, state, peer_id, detail: events.append((index, state)),
    )
    assert asyncio.get_running_loop().time() - started < 5
    winners = [o for o in outcomes if o is not None]
    assert len(winners) >= 1 and all(o.executed_by.startswith("fast") for o in winners)
    assert any(state == "superseded" for _, state in events)


async def test_each_group_gets_its_own_winner():
    network = FakeNetwork(["a", "b", "c", "d"], delay=0.01)
    outcomes = await dispatcher(network).run(
        "test.task", inputs(4), run_locally=local, groups=["f1", "f1", "f2", "f2"]
    )
    done = [i for i, o in enumerate(outcomes) if o is not None]
    assert any(i in (0, 1) for i in done) and any(i in (2, 3) for i in done)


async def test_task_states_are_reported_in_order():
    network = FakeNetwork(["a"], delay=0.01)
    seen: list[tuple[int, str, str | None]] = []
    await dispatcher(network).run(
        "test.task",
        inputs(1),
        run_locally=local,
        on_task=lambda index, state, peer_id, detail: seen.append((index, state, peer_id)),
    )
    assert seen == [(0, "queued", None), (0, "running", "a"), (0, "done", "a")]


async def test_a_failed_peer_reports_failed_then_the_task_finishes_elsewhere():
    network = FakeNetwork(["dead", "ok"], dead={"dead"}, delay=0.01)
    seen: list[tuple[int, str]] = []
    outcomes = await dispatcher(network).run(
        "test.task",
        inputs(2),
        run_locally=local,
        on_task=lambda index, state, peer_id, detail: seen.append((index, state)),
    )
    assert all(o is not None and o.executed_by != "dead" for o in outcomes)
    assert any(state == "failed" for _, state in seen)


async def test_group_fallback_runs_only_one_local_start():
    calls = []

    def count_local(task_input):
        calls.append(task_input["n"])
        return {"n": task_input["n"], "by": LOCAL}

    outcomes = await dispatcher(FakeNetwork([])).run(
        "test.task", inputs(3), run_locally=count_local, groups=["x", "x", "x"]
    )
    assert len(calls) == 1 and sum(o is not None for o in outcomes) == 1
