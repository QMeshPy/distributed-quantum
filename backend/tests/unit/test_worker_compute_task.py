"""PeerFragmentWorker.handle_task: the peer side of the compute-task protocol."""

from __future__ import annotations

import pytest

from quantum_backend_v2.application import compute_tasks
from quantum_backend_v2.libp2p.fragment_worker import PeerFragmentWorker
from quantum_backend_v2.protocols.compute import ComputeTaskRequest, ComputeTaskResponse

pytestmark = pytest.mark.anyio


def request(kind, **task_input):
    return (
        ComputeTaskRequest(task_id="task-00000001", kind=kind, input=task_input)
        .model_dump_json()
        .encode()
    )


async def ask(worker, kind, **task_input):
    return ComputeTaskResponse.model_validate_json(
        await worker.handle_task(request(kind, **task_input))
    )


async def test_runs_a_known_task_and_reports_who_ran_it(monkeypatch):
    monkeypatch.setitem(
        compute_tasks.TASK_KINDS, "test.double", lambda payload: {"twice": payload["n"] * 2}
    )
    response = await ask(PeerFragmentWorker(peer_id="peer-a"), "test.double", n=21)
    assert response.ok and response.output == {"twice": 42}
    assert response.executing_peer_id == "peer-a" and response.latency_ms is not None


async def test_unknown_kind_is_refused_so_the_coordinator_can_reroute():
    response = await ask(PeerFragmentWorker(peer_id="peer-a"), "test.nothing")
    assert not response.ok and "unknown task kind" in response.error


async def test_a_crashing_task_comes_back_as_an_error_not_an_exception(monkeypatch):
    def boom(payload):
        raise ImportError("No module named 'pennylane'")

    monkeypatch.setitem(compute_tasks.TASK_KINDS, "test.boom", boom)
    worker = PeerFragmentWorker(peer_id="peer-a")
    response = await ask(worker, "test.boom")
    assert not response.ok and "pennylane" in response.error
    assert worker.heartbeat_snapshot() == (0, 0)  # the failed task no longer counts as active


async def test_the_pharma_vqe_task_runs_on_a_problem_without_pyscf():
    from quantum_backend_v2.pharma.vqe_kernel import build_vqe_problem

    problem = build_vqe_problem("[H][H]")
    response = await ask(
        PeerFragmentWorker(peer_id="peer-a"),
        compute_tasks.PHARMA_VQE,
        problem=problem,
        max_iterations=150,
        seed=None,
    )
    assert response.ok
    assert response.output["energy"] == pytest.approx(problem["exact_energy"], abs=1.6e-3)
