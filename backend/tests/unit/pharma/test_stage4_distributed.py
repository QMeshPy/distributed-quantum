"""Stage 4 run_many: which tasks are made, how results are merged, what is reported honestly."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from quantum_backend_v2.application.peer_tasks import LOCAL, TaskOutcome
from quantum_backend_v2.pharma.cache import FragmentCache
from quantum_backend_v2.pharma.config import VQEConfig
from quantum_backend_v2.pharma.models import MolecularFragment
from quantum_backend_v2.pharma.stages import stage_4
from quantum_backend_v2.pharma.stages.stage_4 import MAX_STARTS, VQEExecutor

pytestmark = pytest.mark.anyio


def fragment(fragment_id, smiles):
    return MolecularFragment(
        fragment_id=fragment_id,
        smiles=smiles,
        parent_ligand_smiles="CCO",
        atom_indices=(),
        adjacent_fragments=(),
        rotatable_bonds=0,
    )


def problem_for(smiles):
    return {
        "smiles": smiles,
        "n_qubits": 8,
        "n_electrons": 4,
        "terms": [],
        "exact_energy": -10.0,
        "homo_ev": -9.0,
        "lumo_ev": 3.0,
    }


class RecordingDispatcher:
    """Pretends to be PeerTaskDispatcher: records tasks and, like the real one, lets only the
    first task of each group finish (the rest are superseded)."""

    def __init__(self, peer_count, *, executed_by="peer-x"):
        self.peer_count, self.executed_by, self.tasks, self.groups = peer_count, executed_by, [], []

    def peers(self):
        return [object()] * self.peer_count

    def label_of(self, peer_id):
        return f"label-of-{peer_id}"

    async def run(self, kind, inputs, *, run_locally, on_event, on_task, groups):
        self.tasks, self.groups = inputs, groups
        outcomes, won = [], set()
        for index, task in enumerate(inputs):
            on_task(index, "queued", None, None)
        for index, task in enumerate(inputs):
            if groups[index] in won:
                outcomes.append(None)
                on_task(index, "superseded", None, None)
                continue
            won.add(groups[index])
            on_task(index, "running", self.executed_by, None)
            on_task(index, "done", self.executed_by, None)
            outcomes.append(
                TaskOutcome(
                    output={"energy": -10.0, "evaluations": 5, "gates": 9},
                    executed_by=self.executed_by,
                    attempts=1,
                    elapsed_seconds=0.1,
                )
            )
        return outcomes


def executor(dispatcher, monkeypatch, *, cache_hit=None):
    monkeypatch.setattr(stage_4, "build_vqe_problem", lambda smiles, **_: problem_for(smiles))
    cache = MagicMock(spec=FragmentCache)
    cache.get = AsyncMock(return_value=cache_hit)
    return VQEExecutor(VQEConfig(), cache, dispatcher)


async def test_one_start_per_fragment_when_peers_do_not_outnumber_fragments(monkeypatch):
    dispatcher = RecordingDispatcher(peer_count=3)
    runs = await executor(dispatcher, monkeypatch).run_many(
        [fragment("f1", "CC=O"), fragment("f2", "O=CO"), fragment("f3", "c1ccccc1")]
    )
    assert len(dispatcher.tasks) == 3 and all(task["seed"] is None for task in dispatcher.tasks)
    assert all(run.result.vqe_starts == 1 for run in runs.values())


async def test_extra_peers_get_extra_starts_and_the_first_finisher_is_used(monkeypatch):
    dispatcher = RecordingDispatcher(peer_count=30)
    runs = await executor(dispatcher, monkeypatch).run_many(
        [fragment("f1", "CC=O"), fragment("f2", "O=CO"), fragment("f3", "c1ccccc1")]
    )
    assert len(dispatcher.tasks) == 3 * MAX_STARTS  # 30 peers / 3 fragments = 10 starts each
    seeds = [task["seed"] for task in dispatcher.tasks[:MAX_STARTS]]
    assert seeds == [None, *range(1, MAX_STARTS)]
    assert dispatcher.groups == ["f1"] * MAX_STARTS + ["f2"] * MAX_STARTS + ["f3"] * MAX_STARTS
    result = runs["f1"].result
    assert result.vqe_starts == 1  # counts finished runs, not launched ones
    assert result.exact_energy_hartree == -10.0
    assert runs["f1"].executed_by == ["peer-x"]


async def test_progress_records_show_each_task_and_who_runs_it(monkeypatch):
    seen = []
    await executor(RecordingDispatcher(peer_count=6), monkeypatch).run_many(
        [fragment("f1", "CC=O"), fragment("f2", "O=CO")], on_progress=seen.append
    )
    final = seen[-1]
    assert len(final) == 6  # 2 fragments x 3 starts
    done = [r for r in final if r["state"] == "done"]
    assert {r["fragment"] for r in done} == {"CC=O", "O=CO"}
    assert all(r["peer"] == "label-of-peer-x" and r["peer_id"] == "peer-x" for r in done)
    assert all(r["seconds"] is not None for r in done)
    assert sum(r["state"] == "superseded" for r in final) == 4
    assert [r["start"] for r in final if r["fragment"] == "CC=O"] == [1, 2, 3]


async def test_no_peers_means_one_local_start_each(monkeypatch):
    dispatcher = RecordingDispatcher(peer_count=0, executed_by=LOCAL)
    runs = await executor(dispatcher, monkeypatch).run_many([fragment("f1", "CC=O")])
    assert len(dispatcher.tasks) == 1 and runs["f1"].executed_by == [LOCAL]


async def test_result_uses_scf_orbital_energies_and_the_real_problem_size(monkeypatch):
    runs = await executor(RecordingDispatcher(1), monkeypatch).run_many([fragment("f1", "CC=O")])
    result = runs["f1"].result
    assert (result.homo_energy_ev, result.lumo_energy_ev) == (-9.0, 3.0)
    assert result.homo_lumo_gap_ev == 12.0 and result.chemical_hardness_ev == 6.0
    assert result.qubit_count == 8 and result.gate_count == 9 and result.esp_charges == []


async def test_a_fragment_that_cannot_be_built_is_reported_not_faked(monkeypatch):
    def build(smiles, **_):
        if smiles == "[CH3]":
            raise ValueError("[CH3] has an odd electron count")
        return problem_for(smiles)

    dispatcher = RecordingDispatcher(2)
    ex = executor(dispatcher, monkeypatch)
    monkeypatch.setattr(stage_4, "build_vqe_problem", build)
    runs = await ex.run_many([fragment("good", "CC=O"), fragment("radical", "[CH3]")])
    assert runs["radical"].result is None and "odd electron" in runs["radical"].error
    assert runs["good"].result is not None
    assert all(task["problem"]["smiles"] == "CC=O" for task in dispatcher.tasks)


async def test_cache_hits_skip_the_peers_entirely(monkeypatch):
    cached = SimpleNamespace(
        homo_energy_ev=-8.0,
        lumo_energy_ev=2.0,
        homo_lumo_gap_ev=10.0,
        chemical_hardness_ev=5.0,
        esp_charges=[],
        ground_state_energy_hartree=-5.0,
        qubit_count=8,
        gate_count=4,
        vqe_iterations=3,
        dmet_impurity_size=None,
        exact_energy_hartree=-5.0,
        vqe_starts=2,
    )
    dispatcher = RecordingDispatcher(5)
    runs = await executor(dispatcher, monkeypatch, cache_hit=cached).run_many(
        [fragment("f1", "CC=O")]
    )
    assert (
        dispatcher.tasks == [] and runs["f1"].result.cached and runs["f1"].executed_by == ["cache"]
    )
