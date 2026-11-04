"""Stage 4: active-space VQE for fragment electronic descriptors.

Each fragment's VQE is an independent task. They are spread over the connected peers (several
independent starts per fragment when there are more peers than fragments) and fall back to
running on this machine. Cache checked first; only misses are computed.
"""

from __future__ import annotations

import asyncio
import math
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from quantum_backend_v2.application.compute_tasks import PHARMA_VQE, run_pharma_vqe
from quantum_backend_v2.application.peer_tasks import PeerTaskDispatcher
from quantum_backend_v2.pharma.cache import FragmentCache
from quantum_backend_v2.pharma.config import VQEConfig
from quantum_backend_v2.pharma.models import MolecularFragment, VQEDescriptors
from quantum_backend_v2.pharma.vqe_kernel import build_vqe_problem

# Past this many starts a fragment gains nothing; extra peers simply stay idle.
MAX_STARTS = 10


@dataclass
class VQEResult:
    fragment_id: str
    homo_energy_ev: float
    lumo_energy_ev: float
    homo_lumo_gap_ev: float
    chemical_hardness_ev: float
    esp_charges: list[float]
    ground_state_energy_hartree: float
    qubit_count: int
    gate_count: int
    vqe_iterations: int
    dmet_impurity_size: int | None = None
    exact_energy_hartree: float | None = None
    vqe_starts: int = 1
    cached: bool = False

    def to_descriptors(self) -> VQEDescriptors:
        return VQEDescriptors(
            fragment_id=self.fragment_id,
            homo_energy_ev=self.homo_energy_ev,
            lumo_energy_ev=self.lumo_energy_ev,
            homo_lumo_gap_ev=self.homo_lumo_gap_ev,
            chemical_hardness_ev=self.chemical_hardness_ev,
            esp_charges=self.esp_charges,
            ground_state_energy_hartree=self.ground_state_energy_hartree,
            qubit_count=self.qubit_count,
            gate_count=self.gate_count,
            vqe_iterations=self.vqe_iterations,
            dmet_impurity_size=self.dmet_impurity_size,
            exact_energy_hartree=self.exact_energy_hartree,
            vqe_starts=self.vqe_starts,
            cached=self.cached,
        )


@dataclass
class FragmentRun:
    """What happened to one fragment: its result (or why there is none) and who computed it."""

    result: VQEResult | None
    executed_by: list[str] = field(default_factory=list)  # peer IDs, LOCAL, or ["cache"]
    error: str | None = None


class VQEExecutor:
    """Runs VQE for fragments — cache-first, then peers or this machine."""

    def __init__(
        self,
        config: VQEConfig,
        cache: FragmentCache,
        dispatcher: PeerTaskDispatcher | None = None,
    ) -> None:
        self._cfg = config
        self._cache = cache
        self._dispatcher = dispatcher or PeerTaskDispatcher(
            discovery_service=None, protocol_id="", local_peer_id=""
        )

    def label_of(self, peer_id: str) -> str:
        return self._dispatcher.label_of(peer_id)

    async def run(self, fragment: MolecularFragment) -> VQEResult:
        """One fragment, on this machine."""
        cached = await self._cached(fragment)
        if cached is not None:
            return cached
        return await asyncio.to_thread(self._run_vqe_sync, fragment)

    def _run_vqe_sync(self, fragment: MolecularFragment) -> VQEResult:
        problem = self._problem(fragment)
        return self._assemble(fragment, problem, [run_pharma_vqe(self._task_input(problem, None))])

    async def run_many(
        self,
        fragments: list[MolecularFragment],
        on_event: Callable[[str], None] = lambda message: None,
        on_progress: Callable[[list[dict[str, Any]]], None] = lambda records: None,
    ) -> dict[str, FragmentRun]:
        """Compute every fragment, spreading the VQE runs over the peers. Never raises per fragment.

        Each fragment is run from several starting points when there are spare peers; the first
        start to finish is used. `on_progress` receives one status record per task as they change.
        """
        runs: dict[str, FragmentRun] = {}
        todo: list[MolecularFragment] = []
        for fragment in fragments:
            cached = await self._cached(fragment)
            if cached is not None:
                runs[fragment.fragment_id] = FragmentRun(cached, ["cache"])
            else:
                todo.append(fragment)
        if not todo:
            return runs

        built = await asyncio.gather(
            *(asyncio.to_thread(self._problem, fragment) for fragment in todo),
            return_exceptions=True,
        )
        problems: dict[str, dict[str, Any]] = {}
        for fragment, outcome in zip(todo, built, strict=True):
            if isinstance(outcome, BaseException):
                runs[fragment.fragment_id] = FragmentRun(None, error=str(outcome))
            else:
                problems[fragment.fragment_id] = outcome
        if not problems:
            return runs

        peer_count = len(self._dispatcher.peers())
        starts = max(1, min(MAX_STARTS, math.ceil(peer_count / len(problems))))
        # Start 0 is the plain Hartree-Fock start; the others are seeded perturbations of it.
        jobs = [
            (fragment_id, self._task_input(problem, None if start == 0 else start))
            for fragment_id, problem in problems.items()
            for start in range(starts)
        ]
        on_event(
            f"{len(jobs)} VQE task(s): {len(problems)} fragment(s) x {starts} start(s) "
            f"over {peer_count} connected peer(s)"
        )
        smiles_of = {fragment.fragment_id: fragment.smiles for fragment in todo}
        records = [
            {
                "task": number,
                "fragment": smiles_of[fragment_id],
                "start": 1 if task_input["seed"] is None else task_input["seed"] + 1,
                "state": "queued",
                "peer": None,
                "peer_id": None,
                "started_at": None,
                "seconds": None,
                "error": None,
            }
            for number, (fragment_id, task_input) in enumerate(jobs, start=1)
        ]

        def on_task(index: int, state: str, peer_id: str | None, detail: str | None) -> None:
            record = records[index]
            record["state"] = state
            if peer_id is not None:
                record["peer_id"] = peer_id
                record["peer"] = self._dispatcher.label_of(peer_id)
            if state == "running":
                record["started_at"] = time.time()
            elif state in ("done", "failed") and record["started_at"] is not None:
                record["seconds"] = round(time.time() - record["started_at"], 1)
            if detail:
                record["error"] = detail
            on_progress([dict(r) for r in records])

        outcomes = await self._dispatcher.run(
            PHARMA_VQE,
            [task_input for _, task_input in jobs],
            run_locally=run_pharma_vqe,
            on_event=on_event,
            on_task=on_task,
            groups=[fragment_id for fragment_id, _ in jobs],
        )

        for fragment in todo:
            fragment_id = fragment.fragment_id
            if fragment_id not in problems:
                continue
            finished = [
                out
                for (owner, _), out in zip(jobs, outcomes, strict=True)
                if owner == fragment_id and out is not None
            ]
            if not finished:
                runs[fragment_id] = FragmentRun(None, error="no VQE run finished")
                continue
            result = self._assemble(fragment, problems[fragment_id], [o.output for o in finished])
            runs[fragment_id] = FragmentRun(result, [out.executed_by for out in finished])
        return runs

    async def _cached(self, fragment: MolecularFragment) -> VQEResult | None:
        cached = await self._cache.get(fragment.smiles)
        if cached is None:
            return None
        return VQEResult(
            fragment_id=fragment.fragment_id,
            homo_energy_ev=cached.homo_energy_ev,
            lumo_energy_ev=cached.lumo_energy_ev,
            homo_lumo_gap_ev=cached.homo_lumo_gap_ev,
            chemical_hardness_ev=cached.chemical_hardness_ev,
            esp_charges=cached.esp_charges,
            ground_state_energy_hartree=cached.ground_state_energy_hartree,
            qubit_count=cached.qubit_count,
            gate_count=cached.gate_count,
            vqe_iterations=cached.vqe_iterations,
            dmet_impurity_size=cached.dmet_impurity_size,
            exact_energy_hartree=cached.exact_energy_hartree,
            vqe_starts=cached.vqe_starts,
            cached=True,
        )

    def _problem(self, fragment: MolecularFragment) -> dict[str, Any]:
        return build_vqe_problem(
            fragment.smiles, basis=self._cfg.basis_set, active_orbitals=self._cfg.active_orbitals
        )

    def _task_input(self, problem: dict[str, Any], seed: int | None) -> dict[str, Any]:
        return {"problem": problem, "max_iterations": self._cfg.max_iterations, "seed": seed}

    def _assemble(
        self, fragment: MolecularFragment, problem: dict[str, Any], outputs: list[dict[str, Any]]
    ) -> VQEResult:
        best = min(outputs, key=lambda output: output["energy"])
        gap = problem["lumo_ev"] - problem["homo_ev"]
        return VQEResult(
            fragment_id=fragment.fragment_id,
            homo_energy_ev=problem["homo_ev"],  # RHF orbital energies, not VQE outputs
            lumo_energy_ev=problem["lumo_ev"],
            homo_lumo_gap_ev=gap,
            chemical_hardness_ev=gap / 2,
            esp_charges=[],
            ground_state_energy_hartree=best["energy"],
            qubit_count=problem["n_qubits"],
            gate_count=max(best["gates"], 1),
            vqe_iterations=best["evaluations"],
            exact_energy_hartree=problem["exact_energy"],
            vqe_starts=len(outputs),
        )
