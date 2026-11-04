"""Big molecules are docked in passes instead of refused; a hop into a non-molecule is refused."""

from __future__ import annotations

import numpy as np
import pytest

from quantum_backend_v2.pharma.config import PharmaMode, PharmaWorkflowConfig
from quantum_backend_v2.pharma.live_state import clear_live, get_live, init_live, update_live
from quantum_backend_v2.pharma.models import MolecularFragment
from quantum_backend_v2.pharma.orchestrator import (
    MAX_FRAGMENTS_PER_DOCKING_PASS,
    PharmaOrchestrator,
    _merge_docking,
)
from quantum_backend_v2.pharma.stages.stage_5 import DockingResult

pytestmark = pytest.mark.anyio

ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"
# The 6LU7 peptidomimetic from the demo: 5 fragments, which used to be refused.
PEPTIDE = "CC(C)(C)OC(=O)N[C@@H](CC1CCCCC1)C(=O)N[C@@H](CC(=O)O)C(=O)NC2=CC=CC=C2"


def orchestrator(logs):
    config = PharmaWorkflowConfig(mode=PharmaMode.OPTIMIZATION, target_pdb_id="1IEP")
    def log(level, message, stage=None):
        logs.append((level, message))

    return PharmaOrchestrator(config, None, None, log_callback=log)


async def test_the_demo_molecule_is_fragmented_and_docked_in_one_pass():
    logs = []
    orch = orchestrator(logs)
    fragments = orch._decomposer.decompose(PEPTIDE)
    assert len(fragments) == 5 <= MAX_FRAGMENTS_PER_DOCKING_PASS
    result = await orch._run_stage_5(fragments, {}, None, None)
    assert len(result.placements) == 5
    assert result.n_qubits_used == 15
    assert not any("passes" in message for _, message in logs)


async def test_more_fragments_than_one_pass_are_docked_in_several_and_say_so():
    logs = []
    orch = orchestrator(logs)
    fragments = [
        MolecularFragment(
            fragment_id=f"f{i}",
            smiles="CC",
            parent_ligand_smiles="CC",
            atom_indices=(0,),
            adjacent_fragments=(),
        )
        for i in range(7)
    ]
    result = await orch._run_stage_5(fragments, {}, None, None)
    assert [p.fragment_id for p in result.placements] == [f"f{i}" for i in range(7)]
    assert any("2 passes" in message for _, message in logs)


def test_merging_passes_adds_energy_and_averages_the_rest():
    def one(energy, ratio, beta):
        return DockingResult([], energy, ratio, [beta], [2 * beta], 0.5, 15)

    merged = _merge_docking([one(-10.0, 0.4, 0.2), one(-4.0, 0.8, 0.6)])
    assert merged.total_energy == -14.0
    assert merged.approximation_ratio == pytest.approx(0.6)
    assert merged.beta_params == pytest.approx([0.4])
    assert merged.gamma_params == pytest.approx([0.8])


def test_the_vectorised_energy_matches_the_plain_loop():
    # Wire 0 is the most significant bit; both forms must give the same energy for every state.
    n = 4
    rng = np.random.default_rng(0)
    h, coupling = rng.normal(size=n), np.triu(rng.normal(size=(n, n)), 1)
    states = np.arange(2**n)[:, None]
    spins = 2.0 * ((states >> (n - 1 - np.arange(n))) & 1) - 1.0
    fast = spins @ h + ((spins @ coupling) * spins).sum(axis=1)
    for idx in range(2**n):
        s = [2 * int(b) - 1 for b in format(idx, f"0{n}b")]
        slow = sum(h[i] * s[i] for i in range(n)) + sum(
            coupling[i, j] * s[i] * s[j] for i in range(n) for j in range(i + 1, n)
        )
        assert fast[idx] == pytest.approx(slow)


def test_a_hop_to_a_valid_molecule_is_accepted():
    assert orchestrator([])._hop_is_valid(ASPIRIN) is True


def test_a_hop_into_an_invalid_molecule_is_rejected():
    logs = []
    assert orchestrator(logs)._hop_is_valid("not-a-molecule") is False
    assert any("not a valid molecule" in message for _, message in logs)


def test_stage_3_logs_the_whole_smiles_so_the_dashboard_can_draw_it():
    # It used to cut the SMILES at 40 characters, which the page then showed as "Invalid SMILES".
    import inspect

    from quantum_backend_v2.pharma import orchestrator as module

    assert "[:40]" not in inspect.getsource(module.PharmaOrchestrator._run_stages_3_4)


def test_live_state_carries_peer_tasks_and_a_server_clock():
    init_live("job-guard-test")
    record = {"task": 1, "fragment": "CC=O", "state": "running", "peer": "alice", "started_at": 1.0}
    update_live("job-guard-test", peer_tasks=[record])
    live = get_live("job-guard-test")
    clear_live("job-guard-test")
    assert live.peer_tasks == [record] and live.server_time > 0
