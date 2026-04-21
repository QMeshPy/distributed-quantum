"""Quantum-vs-classical comparison report generation for Track B finance jobs."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping


_EPSILON = 1e-9


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _as_mapping(value: object) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _as_list(value: object) -> list[Any]:
    return value if isinstance(value, list) else []


def _as_str_list(value: object) -> list[str]:
    return [item for item in _as_list(value) if isinstance(item, str) and item]


def _string(value: object, fallback: str = "") -> str:
    return value if isinstance(value, str) else fallback


def _maybe_string(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _number(value: object, fallback: float = 0.0) -> float:
    if isinstance(value, bool):
        return fallback
    if isinstance(value, (int, float)):
        return float(value)
    return fallback


def _maybe_number(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _integer(value: object, fallback: int = 0) -> int:
    if isinstance(value, bool):
        return fallback
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return fallback


def _maybe_integer(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return None


def _selection(value: object) -> dict[str, Any]:
    record = _as_mapping(value)
    return {
        "bitstring": _string(record.get("bitstring")),
        "selected_assets": _as_str_list(record.get("selected_assets")),
        "selected_asset_count": _integer(record.get("selected_asset_count")),
        "feasible": record.get("feasible") is True,
        "budget_gap": _integer(record.get("budget_gap")),
        "objective": _number(record.get("objective")),
        "expected_return": _number(record.get("expected_return")),
        "variance": _number(record.get("variance")),
        "volatility": _number(record.get("volatility")),
        "probability": _maybe_number(record.get("probability")),
        "rank": _maybe_integer(record.get("rank")),
    }


def _winner_for_higher_is_better(gap: float) -> str:
    if gap > _EPSILON:
        return "quantum"
    if gap < -_EPSILON:
        return "classical"
    return "tie"


def _winner_for_lower_is_better(gap: float) -> str:
    if gap < -_EPSILON:
        return "quantum"
    if gap > _EPSILON:
        return "classical"
    return "tie"


def _winner_for_duration(*, classical_duration_ms: int, quantum_duration_ms: int) -> str:
    if classical_duration_ms <= 0 or quantum_duration_ms <= 0:
        return "inconclusive"
    if quantum_duration_ms < classical_duration_ms:
        return "quantum"
    if quantum_duration_ms > classical_duration_ms:
        return "classical"
    return "tie"


def _format_percent(value: float | None, digits: int = 2) -> str:
    if value is None:
        return "n/a"
    return f"{value * 100:.{digits}f}%"


def _format_signed(value: float, digits: int = 6) -> str:
    prefix = "+" if value > 0 else ""
    return f"{prefix}{value:.{digits}f}"


def _classify_pitch_position(
    *,
    objective_winner: str,
    has_qasm: bool,
    has_runtime_result: bool,
    feasible_probability_mass: float,
    quantum_on_frontier: bool,
) -> str:
    if objective_winner == "quantum" and has_qasm and has_runtime_result:
        return "numerical_advantage"
    if has_qasm and has_runtime_result and (
        feasible_probability_mass >= 0.2 or quantum_on_frontier
    ):
        return "mixed"
    if has_qasm or has_runtime_result:
        return "workflow_evidence"
    return "not_ready"


def _classify_claim_readiness(
    *,
    has_qasm: bool,
    has_runtime_result: bool,
    exact_baseline_available: bool,
    asset_count: int,
) -> str:
    if has_qasm and has_runtime_result and exact_baseline_available:
        return "qualified" if asset_count <= 8 else "ready"
    return "not_ready"


def _build_strengths(
    *,
    feasible_portfolio_count: int,
    classical_evaluated_portfolios: int,
    has_qasm: bool,
    has_runtime_result: bool,
    circuit_qubits: int | None,
    circuit_depth: int | None,
    fragments_executed: int,
    distributed_nodes_used: int,
    feasible_probability_mass: float,
    quantum_on_frontier: bool,
) -> list[str]:
    strengths = [
        (
            "Classical baseline is exact enumeration across "
            f"{classical_evaluated_portfolios or feasible_portfolio_count} feasible portfolios."
        )
    ]
    if has_qasm:
        if circuit_qubits is not None and circuit_depth is not None:
            strengths.append(
                f"Quantum candidate includes executable OpenQASM with {circuit_qubits} qubits and depth {circuit_depth}."
            )
        else:
            strengths.append("Quantum candidate includes executable OpenQASM output.")
    if has_runtime_result:
        strengths.append(
            "Quantum execution returned runtime evidence via "
            f"{fragments_executed} routed fragments across {max(distributed_nodes_used, 1)} nodes."
        )
    if feasible_probability_mass > 0:
        strengths.append(
            "Quantum search assigned "
            f"{_format_percent(feasible_probability_mass)} probability mass to budget-feasible portfolios."
        )
    if quantum_on_frontier:
        strengths.append("Best feasible quantum state lies on the exact efficient frontier.")
    return strengths


def _build_limitations(
    *,
    objective_winner: str,
    quantum_objective: float,
    classical_objective: float,
    runtime_winner: str,
    classical_duration_ms: int,
    quantum_duration_ms: int,
    optimum_probability: float | None,
    asset_count: int,
    quantum_on_frontier: bool,
    has_runtime_result: bool,
) -> list[str]:
    limitations: list[str] = []
    if objective_winner != "quantum":
        limitations.append(
            "Quantum candidate did not beat the exact classical objective "
            f"({_format_signed(quantum_objective)} vs {_format_signed(classical_objective)})."
        )
    if runtime_winner == "classical":
        limitations.append(
            f"Quantum wall-clock solve was slower ({quantum_duration_ms} ms vs {classical_duration_ms} ms)."
        )
    elif runtime_winner == "inconclusive":
        limitations.append(
            "Runtime comparison is inconclusive because at least one solver timing rounded to zero."
        )
    if optimum_probability is not None and optimum_probability < 0.1:
        limitations.append(
            "The exact classical optimum captured only "
            f"{_format_percent(optimum_probability)} of the quantum probability mass."
        )
    if not quantum_on_frontier:
        limitations.append("Quantum candidate is not on the exact efficient frontier for this run.")
    if asset_count <= 8:
        limitations.append(
            "Current Track B backend screens the quantum solve down to 8 assets or fewer, so this is still a small-scale benchmark."
        )
    if not has_runtime_result:
        limitations.append("No runtime quantum measurement payload was persisted for this run.")
    return limitations


def _build_recommended_claims(
    *,
    pitch_position: str,
    objective_winner: str,
    feasible_probability_mass: float,
    has_qasm: bool,
    has_runtime_result: bool,
) -> list[str]:
    claims = [
        "Both classical and quantum candidates were generated from the same screened dataset, objective, budget, and risk settings."
    ]
    if has_qasm and has_runtime_result:
        claims.append(
            "The platform converts a finance dataset into an executable quantum circuit and surfaces distributed runtime evidence end-to-end."
        )
    if objective_winner == "quantum":
        claims.append(
            "On this dataset and parameterization, the quantum candidate exceeded the exact classical objective."
        )
    elif feasible_probability_mass >= 0.5:
        claims.append(
            "Quantum search concentrated material probability mass on feasible portfolios even though it did not beat the exact optimum."
        )
    elif pitch_position == "workflow_evidence":
        claims.append(
            "This run is best presented as workflow evidence for hybrid quantum finance, not as a superiority claim."
        )
    return claims


def _build_avoid_claims(
    *,
    objective_winner: str,
    runtime_winner: str,
    asset_count: int,
    quantum_on_frontier: bool,
    has_runtime_result: bool,
) -> list[str]:
    avoid_claims: list[str] = []
    if objective_winner != "quantum":
        avoid_claims.append("Do not claim quantum outperformed the exact classical baseline on this dataset.")
    if runtime_winner != "quantum":
        avoid_claims.append("Do not claim a wall-clock speed advantage from this run.")
    if asset_count <= 8:
        avoid_claims.append("Do not extrapolate this result to production-scale portfolio universes.")
    if not quantum_on_frontier:
        avoid_claims.append("Do not claim the quantum candidate lies on the efficient frontier.")
    if not has_runtime_result:
        avoid_claims.append("Do not claim end-to-end runtime execution evidence is available when it is not.")
    return avoid_claims


def _build_headline_and_summary(
    *,
    pitch_position: str,
    objective_gap: float,
    feasible_probability_mass: float,
    quantum_on_frontier: bool,
) -> tuple[str, str]:
    if pitch_position == "numerical_advantage":
        headline = "Quantum candidate outperformed the exact classical baseline on the tracked objective."
        summary = (
            "The same screened dataset and portfolio constraints were used for both solvers, and the routed quantum "
            f"candidate improved the objective by {_format_signed(objective_gap)}."
        )
        return headline, summary

    if pitch_position == "mixed":
        headline = "This run shows real quantum execution evidence, but not a clean numerical advantage."
        summary = (
            "The workflow produced an exact classical optimum, executable OpenQASM, and routed quantum execution. "
            f"The quantum distribution still assigned {_format_percent(feasible_probability_mass)} mass to feasible "
            f"portfolios{' and landed on the frontier' if quantum_on_frontier else ''}, so the signal is meaningful but qualified."
        )
        return headline, summary

    if pitch_position == "workflow_evidence":
        headline = "This run is strong workflow evidence rather than a quantum-beats-classical result."
        summary = (
            "Use this benchmark to demonstrate same-dataset methodology, exact baseline generation, circuit synthesis, "
            "and distributed execution evidence. Do not use it as a numerical outperformance claim."
        )
        return headline, summary

    headline = "Comparison report is incomplete for investor-facing claims."
    summary = (
        "The run does not yet contain enough quantum execution evidence to support a credible quantum-vs-classical comparison."
    )
    return headline, summary


def build_financial_comparison_report(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Normalize a Track B finance payload into an investor-facing comparison artifact."""
    dataset = _as_mapping(payload.get("dataset"))
    request = _as_mapping(payload.get("request"))
    benchmark = _as_mapping(payload.get("benchmark"))
    solver_diagnostics = _as_mapping(payload.get("solver_diagnostics"))
    classical_solver = _as_mapping(solver_diagnostics.get("classical_solver"))
    quantum_solver = _as_mapping(solver_diagnostics.get("quantum_solver"))
    comparison = _as_mapping(benchmark.get("comparison"))
    frontier = _as_mapping(benchmark.get("frontier"))
    timings = _as_mapping(benchmark.get("timings"))
    quantum_execution = _as_mapping(payload.get("quantum_execution"))
    circuit_summary = _as_mapping(quantum_execution.get("circuit_summary"))
    quantum_result = _as_mapping(quantum_execution.get("quantum_result"))
    plan = _as_mapping(quantum_execution.get("plan"))
    warnings = _as_str_list(payload.get("warnings"))

    classical = _selection(benchmark.get("classical"))
    quantum = _selection(benchmark.get("quantum"))

    objective_gap = _number(comparison.get("objective_gap"))
    return_gap = _number(comparison.get("return_gap"))
    variance_gap = _number(comparison.get("variance_gap"))
    classical_duration_ms = _integer(timings.get("classical_duration_ms"))
    quantum_duration_ms = _integer(timings.get("quantum_duration_ms"))
    objective_winner = _winner_for_higher_is_better(objective_gap)
    return_winner = _winner_for_higher_is_better(return_gap)
    risk_winner = _winner_for_lower_is_better(variance_gap)
    runtime_winner = _winner_for_duration(
        classical_duration_ms=classical_duration_ms,
        quantum_duration_ms=quantum_duration_ms,
    )
    asset_count = _integer(dataset.get("asset_count"))
    feasible_portfolio_count = _integer(frontier.get("feasible_portfolio_count"))
    feasible_probability_mass = _number(comparison.get("feasible_probability_mass"))
    optimum_probability = _maybe_number(comparison.get("optimum_probability"))
    quantum_on_frontier = frontier.get("quantum_on_frontier") is True
    has_qasm = bool(_string(quantum_execution.get("circuit_text")).strip())
    has_runtime_result = bool(quantum_result)
    pitch_position = _classify_pitch_position(
        objective_winner=objective_winner,
        has_qasm=has_qasm,
        has_runtime_result=has_runtime_result,
        feasible_probability_mass=feasible_probability_mass,
        quantum_on_frontier=quantum_on_frontier,
    )
    claim_readiness = _classify_claim_readiness(
        has_qasm=has_qasm,
        has_runtime_result=has_runtime_result,
        exact_baseline_available=classical_solver.get("strategy") == "exact_enumeration",
        asset_count=asset_count,
    )
    headline, summary = _build_headline_and_summary(
        pitch_position=pitch_position,
        objective_gap=objective_gap,
        feasible_probability_mass=feasible_probability_mass,
        quantum_on_frontier=quantum_on_frontier,
    )

    classical_report = {
        **classical,
        "duration_ms": classical_duration_ms,
        "strategy": _string(classical_solver.get("strategy"), "unknown"),
        "evaluated_portfolios": _integer(classical_solver.get("evaluated_portfolios")),
        "is_exact_optimum": classical_solver.get("strategy") == "exact_enumeration",
    }
    quantum_report = {
        **quantum,
        "duration_ms": quantum_duration_ms,
        "strategy": _string(quantum_solver.get("strategy"), "unknown"),
        "ansatz": _string(quantum_solver.get("ansatz"), "QAOA"),
        "parameter_evaluations": _integer(quantum_solver.get("parameter_evaluations")),
        "feasible_probability_mass": feasible_probability_mass,
        "optimum_probability": optimum_probability,
        "percentile": _maybe_number(frontier.get("quantum_percentile")),
        "on_frontier": quantum_on_frontier,
        "plan_id": _maybe_string(plan.get("plan_id")),
        "fragments_executed": _integer(payload.get("fragments_executed")),
        "distributed_nodes_used": _integer(payload.get("distributed_nodes_used")),
        "circuit_qubits": _maybe_integer(circuit_summary.get("qubit_count")),
        "circuit_depth": _maybe_integer(circuit_summary.get("depth")),
        "circuit_size": _maybe_integer(circuit_summary.get("size")),
        "has_qasm": has_qasm,
        "has_runtime_result": has_runtime_result,
    }

    strengths = _build_strengths(
        feasible_portfolio_count=feasible_portfolio_count,
        classical_evaluated_portfolios=_integer(classical_solver.get("evaluated_portfolios")),
        has_qasm=has_qasm,
        has_runtime_result=has_runtime_result,
        circuit_qubits=_maybe_integer(circuit_summary.get("qubit_count")),
        circuit_depth=_maybe_integer(circuit_summary.get("depth")),
        fragments_executed=_integer(payload.get("fragments_executed")),
        distributed_nodes_used=_integer(payload.get("distributed_nodes_used")),
        feasible_probability_mass=feasible_probability_mass,
        quantum_on_frontier=quantum_on_frontier,
    )
    limitations = _build_limitations(
        objective_winner=objective_winner,
        quantum_objective=quantum_report["objective"],
        classical_objective=classical_report["objective"],
        runtime_winner=runtime_winner,
        classical_duration_ms=classical_duration_ms,
        quantum_duration_ms=quantum_duration_ms,
        optimum_probability=optimum_probability,
        asset_count=asset_count,
        quantum_on_frontier=quantum_on_frontier,
        has_runtime_result=has_runtime_result,
    )

    return {
        "job_id": _string(payload.get("job_id")),
        "filename": _string(payload.get("filename")),
        "generated_at": _string(payload.get("generated_at"), _utc_now_iso()),
        "fairness": {
            "same_dataset": True,
            "same_constraints": True,
            "same_objective": True,
            "notes": [
                "Classical and quantum candidates are derived from the same screened asset universe and portfolio constraints.",
                "The classical baseline is exact enumeration, not a heuristic fallback.",
                "The quantum candidate is the highest-ranked feasible state returned by the QAOA workflow.",
            ],
        },
        "dataset": {
            "input_layout": _string(dataset.get("input_layout"), "long"),
            "inferred_frequency": _string(dataset.get("inferred_frequency"), "unknown"),
            "row_count": _integer(payload.get("row_count")),
            "col_count": _integer(payload.get("col_count")),
            "period_count": _integer(dataset.get("period_count")),
            "asset_count": asset_count,
            "raw_asset_count": _integer(dataset.get("raw_asset_count")),
            "start_date": _string(dataset.get("start_date")),
            "end_date": _string(dataset.get("end_date")),
            "selected_tickers": _as_str_list(dataset.get("selected_tickers")),
        },
        "problem": {
            "problem_type": _string(payload.get("problem_type"), "portfolio_optimization"),
            "objective_label": _string(benchmark.get("objective_label"), "objective"),
            "allocation_model": _string(
                benchmark.get("allocation_model"),
                _string(solver_diagnostics.get("allocation_model"), "unknown"),
            ),
            "budget": _integer(request.get("budget")),
            "risk_aversion": _number(request.get("risk_aversion")),
            "penalty": _number(request.get("penalty")),
            "qaoa_reps": _integer(request.get("qaoa_reps"), 1),
            "parameter_search_steps": _integer(request.get("parameter_search_steps")),
            "classical_strategy": _string(classical_solver.get("strategy"), "unknown"),
            "quantum_strategy": _string(quantum_solver.get("strategy"), "unknown"),
        },
        "classical": classical_report,
        "quantum": quantum_report,
        "scorecard": {
            "winner_by_objective": objective_winner,
            "winner_by_return": return_winner,
            "winner_by_risk": risk_winner,
            "winner_by_runtime": runtime_winner,
            "objective_gap": objective_gap,
            "objective_ratio": _maybe_number(comparison.get("objective_ratio")),
            "return_gap": return_gap,
            "variance_gap": variance_gap,
            "overlap_count": _integer(comparison.get("overlap_count")),
            "overlap_ratio": _number(comparison.get("overlap_ratio")),
            "quantum_advantage_detected": comparison.get("quantum_advantage_detected") is True,
        },
        "evidence": {
            "exact_baseline_available": classical_report["is_exact_optimum"],
            "efficient_frontier_points": len(_as_list(frontier.get("efficient_frontier"))),
            "top_state_count": len(_as_list(quantum_execution.get("top_states"))),
            "fragment_count": _integer(payload.get("fragments_executed")),
            "observed_basis_state_count": len(_as_mapping(quantum_result.get("counts"))),
            "warnings": warnings,
        },
        "verdict": {
            "pitch_position": pitch_position,
            "claim_readiness": claim_readiness,
            "headline": headline,
            "summary": summary,
            "strengths": strengths,
            "limitations": limitations,
            "recommended_claims": _build_recommended_claims(
                pitch_position=pitch_position,
                objective_winner=objective_winner,
                feasible_probability_mass=feasible_probability_mass,
                has_qasm=has_qasm,
                has_runtime_result=has_runtime_result,
            ),
            "avoid_claims": _build_avoid_claims(
                objective_winner=objective_winner,
                runtime_winner=runtime_winner,
                asset_count=asset_count,
                quantum_on_frontier=quantum_on_frontier,
                has_runtime_result=has_runtime_result,
            ),
        },
    }
