"""Tests for Track B finance comparison report generation."""

from __future__ import annotations

from quantum_backend_v2.application.financial_comparison import (
    build_financial_comparison_report,
)


def test_build_financial_comparison_report_flags_workflow_evidence_when_classical_wins() -> None:
    payload: dict[str, object] = {
        "job_id": "fin-123",
        "filename": "portfolio.csv",
        "problem_type": "portfolio_optimization",
        "generated_at": "2026-04-21T12:00:00+00:00",
        "row_count": 12,
        "col_count": 7,
        "dataset": {
            "input_layout": "wide",
            "inferred_frequency": "monthly",
            "period_count": 11,
            "asset_count": 6,
            "raw_asset_count": 6,
            "start_date": "2024-01-31",
            "end_date": "2024-12-31",
            "selected_tickers": ["AAPL", "MSFT", "NVDA", "GOOG", "AMZN", "IBM"],
        },
        "request": {
            "budget": 3,
            "risk_aversion": 0.6,
            "penalty": 2.4,
            "qaoa_reps": 1,
            "parameter_search_steps": 9,
        },
        "solver_diagnostics": {
            "allocation_model": "equal_weight_binary_selection",
            "classical_solver": {
                "strategy": "exact_enumeration",
                "evaluated_portfolios": 20,
            },
            "quantum_solver": {
                "strategy": "grid_plus_local_refinement",
                "ansatz": "QAOA",
                "parameter_evaluations": 81,
            },
        },
        "benchmark": {
            "objective_label": "annualized_return - 0.600 * annualized_variance",
            "allocation_model": "equal_weight_binary_selection",
            "classical": {
                "bitstring": "101001",
                "selected_assets": ["AMZN", "AAPL", "NVDA"],
                "selected_asset_count": 3,
                "feasible": True,
                "budget_gap": 0,
                "objective": 1.130206893668,
                "expected_return": 1.62,
                "variance": 0.816321843887,
                "volatility": 0.903505,
            },
            "quantum": {
                "bitstring": "010110",
                "selected_assets": ["MSFT", "GOOG", "IBM"],
                "selected_asset_count": 3,
                "feasible": True,
                "budget_gap": 0,
                "objective": 0.670718238664,
                "expected_return": 1.19,
                "variance": 0.86547,
                "volatility": 0.930307,
                "probability": 0.034746085793,
                "rank": 8,
            },
            "comparison": {
                "objective_gap": -0.459488655004,
                "objective_ratio": 0.593447308118,
                "return_gap": -0.43,
                "variance_gap": 0.049148156113,
                "overlap_count": 0,
                "overlap_ratio": 0.0,
                "feasible_probability_mass": 0.668461821761,
                "optimum_probability": 0.032143811411,
                "quantum_advantage_detected": False,
            },
            "frontier": {
                "feasible_portfolio_count": 20,
                "efficient_frontier": [{"bitstring": "101001"}],
                "quantum_rank": 8,
                "quantum_percentile": 0.631578947368,
                "quantum_on_frontier": False,
            },
            "timings": {
                "classical_duration_ms": 0,
                "quantum_duration_ms": 571,
            },
        },
        "warnings": [
            "Only 11 aligned periods were available across the screened assets.",
        ],
        "fragments_executed": 69,
        "distributed_nodes_used": 3,
        "quantum_execution": {
            "circuit_text": "OPENQASM 2.0;",
            "circuit_summary": {
                "qubit_count": 6,
                "depth": 42,
                "size": 108,
            },
            "top_states": [{"bitstring": "010110"}],
            "quantum_result": {
                "counts": {"010110": 18, "101001": 17},
            },
            "plan": {
                "plan_id": "plan-123",
            },
        },
    }

    report = build_financial_comparison_report(payload)

    assert report["scorecard"]["winner_by_objective"] == "classical"
    assert report["scorecard"]["winner_by_runtime"] == "inconclusive"
    assert report["verdict"]["pitch_position"] == "mixed"
    assert report["verdict"]["claim_readiness"] == "qualified"
    assert report["quantum"]["has_qasm"] is True
    assert report["quantum"]["has_runtime_result"] is True
    assert any(
        "Do not claim quantum outperformed the exact classical baseline" in claim
        for claim in report["verdict"]["avoid_claims"]
    )


def test_build_financial_comparison_report_flags_advantage_when_quantum_wins() -> None:
    payload: dict[str, object] = {
        "job_id": "fin-456",
        "filename": "portfolio.csv",
        "problem_type": "portfolio_optimization",
        "generated_at": "2026-04-21T12:00:00+00:00",
        "row_count": 12,
        "col_count": 7,
        "dataset": {
            "asset_count": 6,
        },
        "request": {
            "budget": 3,
            "risk_aversion": 0.5,
            "penalty": 1.8,
            "qaoa_reps": 1,
            "parameter_search_steps": 9,
        },
        "solver_diagnostics": {
            "classical_solver": {
                "strategy": "exact_enumeration",
                "evaluated_portfolios": 20,
            },
            "quantum_solver": {
                "strategy": "grid_plus_local_refinement",
                "ansatz": "QAOA",
                "parameter_evaluations": 81,
            },
        },
        "benchmark": {
            "objective_label": "objective",
            "classical": {
                "bitstring": "101001",
                "selected_assets": ["AAPL", "MSFT", "NVDA"],
                "selected_asset_count": 3,
                "feasible": True,
                "budget_gap": 0,
                "objective": 0.72,
                "expected_return": 1.1,
                "variance": 0.2,
                "volatility": 0.447,
            },
            "quantum": {
                "bitstring": "110001",
                "selected_assets": ["AAPL", "MSFT", "GOOG"],
                "selected_asset_count": 3,
                "feasible": True,
                "budget_gap": 0,
                "objective": 0.83,
                "expected_return": 1.16,
                "variance": 0.19,
                "volatility": 0.435,
                "probability": 0.42,
                "rank": 1,
            },
            "comparison": {
                "objective_gap": 0.11,
                "objective_ratio": 1.152777777778,
                "return_gap": 0.06,
                "variance_gap": -0.01,
                "overlap_count": 2,
                "overlap_ratio": 0.5,
                "feasible_probability_mass": 0.77,
                "optimum_probability": 0.42,
                "quantum_advantage_detected": True,
            },
            "frontier": {
                "feasible_portfolio_count": 20,
                "efficient_frontier": [{"bitstring": "110001"}],
                "quantum_rank": 1,
                "quantum_percentile": 1.0,
                "quantum_on_frontier": True,
            },
            "timings": {
                "classical_duration_ms": 25,
                "quantum_duration_ms": 18,
            },
        },
        "fragments_executed": 12,
        "distributed_nodes_used": 2,
        "quantum_execution": {
            "circuit_text": "OPENQASM 2.0;",
            "circuit_summary": {
                "qubit_count": 6,
                "depth": 38,
                "size": 96,
            },
            "quantum_result": {
                "counts": {"110001": 54},
            },
        },
    }

    report = build_financial_comparison_report(payload)

    assert report["scorecard"]["winner_by_objective"] == "quantum"
    assert report["scorecard"]["winner_by_return"] == "quantum"
    assert report["scorecard"]["winner_by_risk"] == "quantum"
    assert report["scorecard"]["winner_by_runtime"] == "quantum"
    assert report["verdict"]["pitch_position"] == "numerical_advantage"
    assert report["verdict"]["claim_readiness"] == "qualified"
